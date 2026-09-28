"""Fixed-size character-window chunker (SDD §4.3, FR-3).

Splits per-page text into overlapping windows; preserves metadata so every
chunk can be traced back to its source document, page, and character range.
"""


def chunk_document(
    pages: list[tuple[int, str]],
    document_id: str,
    course_id: str,
    chunk_size: int,
    overlap: int,
) -> list[dict]:
    """Split *pages* into fixed-size character windows with *overlap*.

    Args:
        pages:       List of (1-indexed page_number, page_text) tuples
                     as returned by parse_pdf / parse_pptx.
        document_id: UUID string of the parent document row.
        course_id:   UUID string of the owning course (FR-3 metadata).
        chunk_size:  Maximum characters per chunk window (default via Settings).
        overlap:     Characters to repeat at the start of each successive
                     window; creates context continuity across boundaries.

    Returns:
        List of chunk dicts, each with keys:
          document_id, course_id, page, char_start, char_end, text

        char_start / char_end are absolute offsets within the page text
        (0-based, exclusive end — like Python slices).

    FR-3: every chunk carries document_id, page/slide number, and char range.
    """
    if chunk_size <= 0:
        raise ValueError(f"chunk_size must be positive, got {chunk_size}")
    if overlap < 0:
        raise ValueError(f"overlap must be non-negative, got {overlap}")
    if overlap >= chunk_size:
        raise ValueError(
            f"overlap ({overlap}) must be strictly less than chunk_size ({chunk_size})"
        )

    step = chunk_size - overlap
    chunks: list[dict] = []

    for page_num, text in pages:
        if not text:
            continue
        start = 0
        while start < len(text):
            end = min(start + chunk_size, len(text))
            window = text[start:end]
            if window.strip():  # skip windows that are pure whitespace
                chunks.append(
                    {
                        "document_id": document_id,
                        "course_id": course_id,
                        "page": page_num,
                        "char_start": start,
                        "char_end": end,
                        "text": window,
                    }
                )
            start += step

    return chunks
