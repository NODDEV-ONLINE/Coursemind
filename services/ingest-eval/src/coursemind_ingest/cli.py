"""Command-line interface for the CourseMind ingestion pipeline (C8).

Usage:
    python -m coursemind_ingest.cli ingest <file_path> \\
        --document-id <uuid> \\
        --course-id <uuid>

Exit codes:
    0 — ingestion completed successfully.
    1 — ingestion failed (error details printed to stderr).

Environment variables required (loaded from env or .env file via Settings):
    DATABASE_URL   — psycopg3 connection string.
    GOOGLE_API_KEY — Google AI Studio API key.
"""

from __future__ import annotations

import argparse
import logging
import sys

import psycopg

from .config import Settings
from .embedder import GoogleEmbeddingClient
from .pipeline import ingest_document

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger(__name__)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m coursemind_ingest.cli",
        description="CourseMind document ingestion CLI",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    ingest_p = sub.add_parser("ingest", help="Ingest a PDF or PPTX document")
    ingest_p.add_argument("file_path", help="Absolute path to the document file")
    ingest_p.add_argument(
        "--document-id",
        required=True,
        help="UUID of the pre-existing documents row",
    )
    ingest_p.add_argument(
        "--course-id",
        required=True,
        help="UUID of the owning course",
    )
    return parser


def cmd_ingest(args: argparse.Namespace, settings: Settings) -> int:
    """Execute the ingest sub-command; return exit code."""
    embedder = GoogleEmbeddingClient(
        api_key=settings.GOOGLE_API_KEY,
        model=settings.EMBEDDING_MODEL,
    )

    conn: psycopg.Connection | None = None
    try:
        conn = psycopg.connect(settings.DATABASE_URL)
        ingest_document(
            file_path=args.file_path,
            document_id=args.document_id,
            course_id=args.course_id,
            conn=conn,
            settings=settings,
            embedder=embedder,
        )
        logger.info(
            "Ingestion complete for document %s", args.document_id
        )
        return 0

    except Exception as exc:  # noqa: BLE001 — CLI top-level error boundary
        logger.error("Ingestion failed for document %s: %s", args.document_id, exc)
        return 1

    finally:
        if conn is not None:
            conn.close()


def main(argv: list[str] | None = None) -> int:
    """Entry point; returns exit code."""
    parser = build_parser()
    args = parser.parse_args(argv)

    try:
        settings = Settings()  # type: ignore[call-arg]  # reads required vars from env
    except Exception as exc:  # noqa: BLE001 — CLI top-level error boundary
        logger.error("Configuration error: %s", exc)
        return 1

    if args.command == "ingest":
        return cmd_ingest(args, settings)

    parser.print_help()
    return 1


if __name__ == "__main__":
    sys.exit(main())
