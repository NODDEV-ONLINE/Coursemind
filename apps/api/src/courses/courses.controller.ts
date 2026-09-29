import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  UnauthorizedException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ConfigService } from '../config/config.service.js';
import { IngestClientService } from '../ingest/ingest-client.service.js';
import { ZodValidationPipe } from '../validation/zod-validation.pipe.js';
import {
  CoursesService,
  type CourseRecord,
  type DocumentStatusRecord,
  type QueuedDocument,
} from './courses.service.js';
import {
  createCourseSchema,
  userIdHeaderSchema,
  uuidParamSchema,
  type CreateCourseInput,
} from './courses.schema.js';

/** Accepted upload types (FR-1): PDF and PowerPoint decks. */
const ALLOWED_EXTENSIONS = ['.pdf', '.pptx'] as const;
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
] as const;

/** Max upload size guard (10 MB) — keeps memory-buffered uploads bounded. */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

@Controller('courses')
export class CoursesController {
  constructor(
    private readonly courses: CoursesService,
    private readonly ingest: IngestClientService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Resolve the caller's user id from the trusted `X-User-Id` header (M2 auth
   * placeholder — replaced by a real auth guard in a later milestone). Validated
   * as a UUID; rejects if absent/invalid.
   */
  private requireUserId(header: string | undefined): string {
    const parsed = userIdHeaderSchema.safeParse(header);
    if (!parsed.success) {
      throw new UnauthorizedException('Missing or invalid X-User-Id header');
    }
    return parsed.data;
  }

  /** `POST /courses` — create a course owned by the caller (FR-1). */
  @Post()
  @HttpCode(201)
  async createCourse(
    @Headers('x-user-id') userIdHeader: string | undefined,
    @Body(new ZodValidationPipe(createCourseSchema)) body: CreateCourseInput,
  ): Promise<CourseRecord> {
    const ownerId = this.requireUserId(userIdHeader);
    return this.courses.createCourse(ownerId, body.title);
  }

  /**
   * `POST /courses/:id/documents` — accept a PDF/PPTX upload, persist it, insert a
   * `queued` document row, and fire the ingest hand-off (fire-and-forget). Returns
   * immediately; the client polls the status endpoint (FR-1, FR-5).
   */
  @Post(':id/documents')
  @HttpCode(201)
  @UseInterceptors(
    FileInterceptor('file', {
      // Buffer in memory then write to UPLOAD_DIR under a uuid-prefixed name so
      // the Python service reads a stable, unique path.
      limits: { fileSize: MAX_UPLOAD_BYTES },
    }),
  )
  async uploadDocument(
    @Headers('x-user-id') userIdHeader: string | undefined,
    @Param('id', new ZodValidationPipe(uuidParamSchema)) courseId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<QueuedDocument> {
    const ownerId = this.requireUserId(userIdHeader);

    if (!file) {
      throw new BadRequestException('Missing file (multipart field "file")');
    }
    this.assertAllowedType(file);

    // SR-2: verify the course exists and belongs to the caller before any write.
    await this.courses.assertOwnership(courseId, ownerId);

    // Persist the file to UPLOAD_DIR before creating the DB row, so the queued
    // document always points at a file that exists.
    const filePath = await this.persistUpload(file);

    const queued = await this.courses.insertQueuedDocument(courseId, file.originalname);

    // Fire-and-forget hand-off to the Python pipeline (D4). Not awaited.
    this.ingest.triggerIngest({
      document_id: queued.document_id,
      course_id: courseId,
      file_path: filePath,
    });

    return queued;
  }

  /** `GET /courses/:id/status` — per-document ingest status for a course (FR-5). */
  @Get(':id/status')
  async getStatus(
    @Headers('x-user-id') userIdHeader: string | undefined,
    @Param('id', new ZodValidationPipe(uuidParamSchema)) courseId: string,
  ): Promise<{ course_id: string; documents: DocumentStatusRecord[] }> {
    const ownerId = this.requireUserId(userIdHeader);
    await this.courses.assertOwnership(courseId, ownerId);
    const documents = await this.courses.listDocumentStatus(courseId);
    return { course_id: courseId, documents };
  }

  private assertAllowedType(file: Express.Multer.File): void {
    const name = file.originalname.toLowerCase();
    const extOk = ALLOWED_EXTENSIONS.some((ext) => name.endsWith(ext));
    const mimeOk = (ALLOWED_MIME_TYPES as readonly string[]).includes(file.mimetype);
    if (!extOk && !mimeOk) {
      throw new BadRequestException('Unsupported file type; only PDF and PPTX are allowed');
    }
  }

  /**
   * Write the uploaded buffer to `UPLOAD_DIR/<uuid>-<originalname>` and return the
   * absolute path handed to the ingest service.
   */
  private async persistUpload(file: Express.Multer.File): Promise<string> {
    const uploadDir = this.config.uploadDir;
    await mkdir(uploadDir, { recursive: true });
    // Prefix with a uuid to avoid collisions; keep the original name for readability.
    const safeName = file.originalname.replace(/[/\\]/g, '_');
    const filePath = join(uploadDir, `${randomUUID()}-${safeName}`);
    await writeFile(filePath, file.buffer);
    return filePath;
  }
}
