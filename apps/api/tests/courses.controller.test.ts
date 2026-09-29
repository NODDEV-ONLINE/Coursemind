import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { CoursesController } from '../src/courses/courses.controller.js';
import { CoursesService } from '../src/courses/courses.service.js';
import { IngestClientService } from '../src/ingest/ingest-client.service.js';
import { ConfigService } from '../src/config/config.service.js';
import { DatabaseService } from '../src/database/database.service.js';

const OWNER_ID = '11111111-1111-1111-1111-111111111111';
const COURSE_ID = '22222222-2222-2222-2222-222222222222';
const DOCUMENT_ID = '33333333-3333-3333-3333-333333333333';

/**
 * A fake DatabaseService whose `query` is a vi.fn returning canned rows per call.
 * Everything is mocked — no live Postgres, no live Python service (E4).
 */
class FakeDatabaseService {
  query = vi.fn();
}

class FakeConfigService {
  ingestServiceUrl = 'http://ingest.test:8000';
  uploadDir = '/tmp/coursemind-uploads-test';
  databaseUrl = 'postgresql://u:p@localhost:5432/db';
  port = 3000;
}

function makeFile(name: string, mimetype: string): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: name,
    encoding: '7bit',
    mimetype,
    size: 3,
    buffer: Buffer.from('pdf'),
    stream: undefined as never,
    destination: '',
    filename: '',
    path: '',
  };
}

describe('CoursesController (E4)', () => {
  let controller: CoursesController;
  let db: FakeDatabaseService;
  let ingest: IngestClientService;

  beforeEach(async () => {
    db = new FakeDatabaseService();

    const moduleRef = await Test.createTestingModule({
      controllers: [CoursesController],
      providers: [
        CoursesService,
        IngestClientService,
        { provide: DatabaseService, useValue: db },
        { provide: ConfigService, useValue: new FakeConfigService() },
      ],
    }).compile();

    controller = moduleRef.get(CoursesController);
    ingest = moduleRef.get(IngestClientService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('POST /courses inserts a course and returns the record', async () => {
    const created = {
      id: COURSE_ID,
      title: 'Intro to CS',
      owner_id: OWNER_ID,
      created_at: '2026-01-01T00:00:00.000Z',
    };
    db.query.mockResolvedValueOnce([created]);

    const result = await controller.createCourse(OWNER_ID, { title: 'Intro to CS' });

    expect(result).toEqual(created);
    // Insert scoped to the owner from the header.
    expect(db.query).toHaveBeenCalledTimes(1);
    const [sql, params] = db.query.mock.calls[0]!;
    expect(sql).toMatch(/INSERT INTO courses/i);
    expect(params).toEqual([OWNER_ID, 'Intro to CS']);
  });

  it('POST /courses/:id/documents inserts a queued document and fires the ingest call', async () => {
    // 1st query: ownership check. 2nd query: insert queued document.
    db.query
      .mockResolvedValueOnce([{ owner_id: OWNER_ID }])
      .mockResolvedValueOnce([{ id: DOCUMENT_ID }]);

    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    const file = makeFile('lecture.pdf', 'application/pdf');
    const result = await controller.uploadDocument(OWNER_ID, COURSE_ID, file);

    expect(result).toEqual({
      document_id: DOCUMENT_ID,
      course_id: COURSE_ID,
      filename: 'lecture.pdf',
      status: 'queued',
    });

    // Ownership check ran scoped to the course, then a queued insert.
    expect(db.query.mock.calls[0]![0]).toMatch(/SELECT owner_id FROM courses WHERE id = \$1/i);
    expect(db.query.mock.calls[0]![1]).toEqual([COURSE_ID]);
    expect(db.query.mock.calls[1]![0]).toMatch(/INSERT INTO documents/i);

    // Fire-and-forget dispatch is async; let the microtask flush.
    await new Promise((r) => setImmediate(r));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://ingest.test:8000/ingest');
    const body = JSON.parse((init as RequestInit).body as string) as Record<string, string>;
    expect(body).toMatchObject({ document_id: DOCUMENT_ID, course_id: COURSE_ID });
    expect(body.file_path).toContain('lecture.pdf');
  });

  it('GET /courses/:id/status returns the course-scoped document list', async () => {
    const docs = [
      {
        id: DOCUMENT_ID,
        filename: 'lecture.pdf',
        status: 'ready',
        failure_reason: null,
        created_at: '2026-01-02T00:00:00.000Z',
      },
    ];
    db.query
      .mockResolvedValueOnce([{ owner_id: OWNER_ID }]) // ownership
      .mockResolvedValueOnce(docs); // status list

    const result = await controller.getStatus(OWNER_ID, COURSE_ID);

    expect(result).toEqual({ course_id: COURSE_ID, documents: docs });
    // Status query is scoped by course_id and does NOT select content_hash/pages.
    const statusSql = db.query.mock.calls[1]![0] as string;
    expect(statusSql).toMatch(/WHERE course_id = \$1/i);
    expect(statusSql).not.toMatch(/content_hash/i);
    expect(statusSql).not.toMatch(/pages/i);
    expect(db.query.mock.calls[1]![1]).toEqual([COURSE_ID]);
  });

  it('ingest fire-and-forget network failure sets document status=failed', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    vi.stubGlobal('fetch', fetchMock);

    // dispatch runs the update; capture the failure UPDATE.
    db.query.mockResolvedValue([]);

    ingest.triggerIngest({
      document_id: DOCUMENT_ID,
      course_id: COURSE_ID,
      file_path: '/tmp/x.pdf',
    });

    await new Promise((r) => setImmediate(r));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    // A failing dispatch marks the document failed, scoped by course_id (SR-2).
    const failCall = db.query.mock.calls.find((c) =>
      /SET status = 'failed'/i.test(c[0] as string),
    );
    expect(failCall).toBeDefined();
    expect(failCall![1]).toEqual([
      COURSE_ID,
      DOCUMENT_ID,
      expect.stringContaining('ECONNREFUSED'),
    ]);
  });
});
