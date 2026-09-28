import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '../config/config.service.js';
import { DatabaseService } from '../database/database.service.js';

/** Request body accepted by the Python ingest service `POST /ingest`. */
interface IngestRequest {
  readonly document_id: string;
  readonly course_id: string;
  readonly file_path: string;
}

/**
 * Hand-off client to the Python ingestion service (M2 Task D4). Uses native
 * `fetch` (no axios). The trigger is deliberately FIRE-AND-FORGET: the API
 * inserts the `queued` document row, kicks the ingest call without awaiting the
 * pipeline, and returns immediately. The Python service drives
 * `processing → ready | failed` via its own DB writes; the client polls
 * `GET /courses/:id/status`.
 *
 * If the fire-and-forget HTTP call itself fails (network error, or the service
 * rejects the request before running), we mark the document `failed` with a
 * reason so the failure is visible and retryable (FR-5), never silent.
 */
@Injectable()
export class IngestClientService {
  private readonly logger = new Logger(IngestClientService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly db: DatabaseService,
  ) {}

  /**
   * Fire the ingest call without awaiting the pipeline. Course-scoped failure
   * handling: on error we set the document `failed` scoped by `course_id` (SR-2).
   */
  triggerIngest(req: IngestRequest): void {
    // Not awaited by the caller: the promise runs to completion in the
    // background. Any error is caught and persisted rather than thrown.
    void this.dispatch(req);
  }

  private async dispatch(req: IngestRequest): Promise<void> {
    const url = `${this.config.ingestServiceUrl}/ingest`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      });
      if (!res.ok) {
        // The service responded but rejected the request. Surface it as a
        // failure so the lecturer can retry.
        const detail = await this.safeReadBody(res);
        await this.markFailed(
          req,
          `ingest service responded ${res.status}${detail ? `: ${detail}` : ''}`,
        );
      }
    } catch (err) {
      // Network-level error before the Python service responded.
      const message = err instanceof Error ? err.message : String(err);
      await this.markFailed(req, `ingest request failed: ${message}`);
    }
  }

  private async safeReadBody(res: Response): Promise<string> {
    try {
      const text = await res.text();
      return text.slice(0, 500);
    } catch {
      return '';
    }
  }

  private async markFailed(req: IngestRequest, reason: string): Promise<void> {
    this.logger.warn(`Ingest trigger failed for document ${req.document_id}: ${reason}`);
    try {
      // Course-scoped write (SR-2): only touch the document within its course.
      await this.db.query(
        `UPDATE documents
            SET status = 'failed', failure_reason = $3
          WHERE id = $2 AND course_id = $1`,
        [req.course_id, req.document_id, reason],
      );
    } catch (dbErr) {
      const message = dbErr instanceof Error ? dbErr.message : String(dbErr);
      this.logger.error(
        `Failed to persist ingest failure for document ${req.document_id}: ${message}`,
      );
    }
  }
}
