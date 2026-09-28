"""Document parsers for PDF and PPTX (SDD §4.3, FR-2).

Each parser returns a list of (page_number, text) tuples where:
  - page_number is 1-indexed
  - text is the page/slide text in reading order
  - blank pages/slides (text is empty or whitespace-only) are skipped
"""

from pathlib import Path


def parse_pdf(path: str | Path) -> list[tuple[int, str]]:
    """Parse a PDF and return (1-indexed page number, text) for each non-blank page.

    Uses PyMuPDF (fitz) with the 'text' extraction mode and reading-order
    sort (sort=True), which processes text blocks left-to-right, top-to-bottom.

    FR-2: preserve page numbers and text order.
    """
    import pymupdf as fitz  # PyMuPDF >= 1.24; 'pymupdf' is the preferred import

    pages: list[tuple[int, str]] = []
    doc = fitz.open(str(path))
    try:
        for page_index in range(len(doc)):
            page = doc.load_page(page_index)
            # sort=True: reading-order sort (left→right, top→bottom)
            text = page.get_text("text", sort=True).strip()
            if text:
                pages.append((page_index + 1, text))  # 1-indexed
    finally:
        doc.close()
    return pages


def parse_pptx(path: str | Path) -> list[tuple[int, str]]:
    """Parse a PPTX and return (1-indexed slide number, text) for each non-blank slide.

    Extracts text from all shapes that have a text frame, concatenating
    the plain text of all paragraphs/runs in top-to-bottom shape order.

    FR-2: preserve slide numbers and text order.
    """
    from pptx import Presentation  # python-pptx — imported lazily

    slides: list[tuple[int, str]] = []
    prs = Presentation(str(path))
    for slide_index, slide in enumerate(prs.slides):
        parts: list[str] = []
        for shape in slide.shapes:
            if shape.has_text_frame:
                for para in shape.text_frame.paragraphs:
                    line = "".join(run.text for run in para.runs).strip()
                    if line:
                        parts.append(line)
        text = "\n".join(parts).strip()
        if text:
            slides.append((slide_index + 1, text))  # 1-indexed
    return slides
