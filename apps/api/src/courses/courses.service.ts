import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

/** A course row as returned to the client (lean projection). */
export interface CourseRecord {
  id: string;
  title: string;
  owner_id: string;
  created_at: string;
}

/** A per-document status row for `GET /courses/:id/status` (lean projection). */
export interface DocumentStatusRecord {
  id: string;
  filename: string;
  status: 'queued' | 'processing' | 'ready' | 'failed';
  failure_reason: string | null;
  created_at: string;
}

/**
 * The passage behind a citation, for the chat source viewer (FR-15). Lean by
 * design (FR-14/NFR-2): exactly the fields the viewer renders. `text` is
 * untrusted document content (SR-3) — returned verbatim, never interpreted.
 */
export interface ChunkPassageRecord {
  chunk_id: string;
  document_id: string;
  filename: string;
  page: number | null;
  text: string;
}

/** Result of inserting a queued document, returned to the client. */
export interface QueuedDocument {
  document_id: string;
  course_id: string;
  filename: string;
  status: 'queued';
}

/**
 * Course + document data access. Every query is scoped by owner/course id
 * (CLAUDE.md §3, SR-2: "Course isolation always applies — no cross-course reads").
 * No SQL interpolates values; all use bound parameters.
 */
@Injectable()
export class CoursesService {
  constructor(private readonly db: DatabaseService) {}

  /** Create a course owned by the caller. `ownerId` comes from the auth placeholder. */
  async createCourse(ownerId: string, title: string): Promise<CourseRecord> {
    const rows = await this.db.query<CourseRecord>(
      `INSERT INTO courses (owner_id, title)
       VALUES ($1, $2)
       RETURNING id, title, owner_id, created_at`,
      [ownerId, title],
    );
    // INSERT ... RETURNING always yields exactly one row on success.
    return rows[0]!;
  }

  /**
   * Verify the course exists and is owned by `ownerId` (SR-2). Throws 404 if the
   * course does not exist, 403 if it belongs to another owner. Returns the
   * course id for chaining.
   */
  async assertOwnership(courseId: string, ownerId: string): Promise<void> {
    const rows = await this.db.query<{ owner_id: string }>(
      `SELECT owner_id FROM courses WHERE id = $1`,
      [courseId],
    );
    const course = rows[0];
    if (!course) {
      throw new NotFoundException('Course not found');
    }
    if (course.owner_id !== ownerId) {
      throw new ForbiddenException('You do not own this course');
    }
  }

  /**
   * Insert a `queued` document for a course. `content_hash` is left NULL — the
   * Python pipeline fills it on the ready transition (FR-6, migration 0004).
   */
  async insertQueuedDocument(courseId: string, filename: string): Promise<QueuedDocument> {
    const rows = await this.db.query<{ id: string }>(
      `INSERT INTO documents (course_id, filename, status)
       VALUES ($1, $2, 'queued')
       RETURNING id`,
      [courseId, filename],
    );
    return {
      document_id: rows[0]!.id,
      course_id: courseId,
      filename,
      status: 'queued',
    };
  }

  /**
   * Per-document ingest status for a course, newest first. Course-scoped by
   * `course_id` (SR-2). Deliberately omits `content_hash` and `pages` to keep the
   * payload lean and avoid leaking internal fields (CLAUDE.md §7).
   */
  async listDocumentStatus(courseId: string): Promise<DocumentStatusRecord[]> {
    return this.db.query<DocumentStatusRecord>(
      `SELECT id, filename, status, failure_reason, created_at
         FROM documents
        WHERE course_id = $1
        ORDER BY created_at DESC`,
      [courseId],
    );
  }

  /**
   * Read one chunk's passage for the source viewer (FR-15). Course-scoped (SR-2):
   * the chunk must belong to a document whose `course_id` is `courseId`. A chunk
   * that does not exist and a chunk from another course both yield the same 404,
   * so the endpoint cannot be used to probe for chunk ids across courses.
   * Plain parameterised row read — not vector search, so it lives here rather
   * than in `packages/retrieval`.
   */
  async getChunkPassage(courseId: string, chunkId: string): Promise<ChunkPassageRecord> {
    const rows = await this.db.query<ChunkPassageRecord>(
      `SELECT c.id AS chunk_id, c.document_id, d.filename, c.page, c.text
         FROM chunks c
         JOIN documents d ON d.id = c.document_id
        WHERE c.id = $1
          AND d.course_id = $2
          AND c.course_id = $2`,
      [chunkId, courseId],
    );
    const chunk = rows[0];
    if (!chunk) {
      throw new NotFoundException('Chunk not found');
    }
    return chunk;
  }
}
