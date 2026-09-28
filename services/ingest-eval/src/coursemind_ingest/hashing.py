"""Document content-hashing utilities (FR-6 — idempotent re-upload)."""

import hashlib
from pathlib import Path


def sha256_file(path: str | Path) -> str:
    """Return the hex-encoded SHA-256 digest of the file at *path*.

    Reads the file in binary mode to be format-agnostic (PDF, PPTX, etc.).
    The digest is used as a content fingerprint: if the same document is
    re-uploaded with the same bytes, ingestion is skipped rather than
    duplicated (FR-6).
    """
    hasher = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65_536), b""):
            hasher.update(chunk)
    return hasher.hexdigest()
