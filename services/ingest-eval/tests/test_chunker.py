"""Tests for chunker.py (FR-3).

Covers:
  - No chunk exceeds chunk_size characters.
  - char_start / char_end are consistent with chunk text length.
  - document_id and course_id propagated to every chunk.
  - Correct page number on each chunk.
  - Overlap: successive chunks share a character prefix.
  - Edge cases: single-char page, empty pages filtered, invalid args.
"""

from __future__ import annotations

import pytest

from coursemind_ingest.chunker import chunk_document

DOC_ID = "doc-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
COURSE_ID = "course-11111111-2222-3333-4444-555555555555"


def make_pages(text: str, page: int = 1) -> list[tuple[int, str]]:
    return [(page, text)]


class TestChunkSizeEnforcement:
    def test_no_chunk_exceeds_chunk_size(self) -> None:
        text = "a" * 2000
        chunks = chunk_document(make_pages(text), DOC_ID, COURSE_ID, 800, 160)
        for c in chunks:
            assert len(c["text"]) <= 800, (
                f"Chunk length {len(c['text'])} exceeds 800"
            )

    def test_exact_multiple(self) -> None:
        """Text that is exactly 3× chunk_size with no overlap gives 3 chunks."""
        text = "x" * 2400  # exactly 3 × 800 with overlap=0 step=800
        chunks = chunk_document(make_pages(text), DOC_ID, COURSE_ID, 800, 0)
        assert len(chunks) == 3

    def test_text_shorter_than_chunk_size_gives_one_chunk(self) -> None:
        text = "Short text only."
        chunks = chunk_document(make_pages(text), DOC_ID, COURSE_ID, 800, 160)
        assert len(chunks) == 1
        assert chunks[0]["text"] == text


class TestCharOffsets:
    def test_char_start_char_end_match_text_length(self) -> None:
        text = "Hello world! " * 100  # 1300 chars
        chunks = chunk_document(make_pages(text), DOC_ID, COURSE_ID, 800, 160)
        for c in chunks:
            expected_length = c["char_end"] - c["char_start"]
            actual_length = len(c["text"])
            assert actual_length == expected_length, (
                f"char_end - char_start = {expected_length} but len(text) = {actual_length}"
            )

    def test_char_start_is_non_negative(self) -> None:
        text = "A" * 500
        chunks = chunk_document(make_pages(text), DOC_ID, COURSE_ID, 200, 50)
        for c in chunks:
            assert c["char_start"] >= 0

    def test_char_end_does_not_exceed_text_length(self) -> None:
        text = "B" * 750
        chunks = chunk_document(make_pages(text), DOC_ID, COURSE_ID, 800, 160)
        for c in chunks:
            assert c["char_end"] <= len(text)

    def test_char_start_advances_by_step(self) -> None:
        """Each successive chunk's start should increase by (chunk_size - overlap)."""
        text = "C" * 2000
        chunk_size, overlap = 400, 100
        step = chunk_size - overlap
        chunks = chunk_document(make_pages(text), DOC_ID, COURSE_ID, chunk_size, overlap)
        for i in range(1, len(chunks)):
            delta = chunks[i]["char_start"] - chunks[i - 1]["char_start"]
            assert delta == step, (
                f"Expected step {step} between chunks {i-1} and {i}, got {delta}"
            )

    def test_char_start_is_absolute_within_page_text(self) -> None:
        """char_start==0 means the very first character of the page text."""
        text = "First chunk content here."
        chunks = chunk_document(make_pages(text), DOC_ID, COURSE_ID, 800, 160)
        assert chunks[0]["char_start"] == 0
        assert chunks[0]["char_end"] == len(text)


class TestMetadataPropagation:
    def test_document_id_propagated(self) -> None:
        chunks = chunk_document(make_pages("text"), DOC_ID, COURSE_ID, 800, 160)
        for c in chunks:
            assert c["document_id"] == DOC_ID

    def test_course_id_propagated(self) -> None:
        chunks = chunk_document(make_pages("text"), DOC_ID, COURSE_ID, 800, 160)
        for c in chunks:
            assert c["course_id"] == COURSE_ID

    def test_page_number_propagated(self) -> None:
        text = "Some text on page 3." * 50
        chunks = chunk_document([(3, text)], DOC_ID, COURSE_ID, 800, 160)
        for c in chunks:
            assert c["page"] == 3

    def test_multi_page_correct_page_assignment(self) -> None:
        pages = [(1, "Page one content. " * 30), (2, "Page two content. " * 30)]
        chunks = chunk_document(pages, DOC_ID, COURSE_ID, 200, 50)
        page1_chunks = [c for c in chunks if c["page"] == 1]
        page2_chunks = [c for c in chunks if c["page"] == 2]
        assert len(page1_chunks) > 0
        assert len(page2_chunks) > 0

    def test_required_keys_present(self) -> None:
        required = {"document_id", "course_id", "page", "char_start", "char_end", "text"}
        chunks = chunk_document(make_pages("hello world"), DOC_ID, COURSE_ID, 800, 160)
        for c in chunks:
            assert required.issubset(c.keys()), f"Missing keys: {required - set(c.keys())}"


class TestOverlap:
    def test_overlap_creates_shared_prefix(self) -> None:
        """The start of chunk[i+1] should overlap with the end of chunk[i]."""
        text = "Z" * 1000
        chunk_size, overlap = 400, 100
        chunks = chunk_document(make_pages(text), DOC_ID, COURSE_ID, chunk_size, overlap)
        for i in range(len(chunks) - 1):
            end_of_prev = chunks[i]["char_end"]
            start_of_next = chunks[i + 1]["char_start"]
            actual_overlap = end_of_prev - start_of_next
            assert actual_overlap == overlap, (
                f"Expected overlap {overlap}, got {actual_overlap} "
                f"(prev end={end_of_prev}, next start={start_of_next})"
            )


class TestEdgeCases:
    def test_empty_pages_list_returns_no_chunks(self) -> None:
        chunks = chunk_document([], DOC_ID, COURSE_ID, 800, 160)
        assert chunks == []

    def test_whitespace_only_page_skipped(self) -> None:
        pages = [(1, "   \n\t   "), (2, "Real content here.")]
        chunks = chunk_document(pages, DOC_ID, COURSE_ID, 800, 160)
        assert all(c["page"] == 2 for c in chunks)

    def test_invalid_chunk_size_raises(self) -> None:
        with pytest.raises(ValueError, match="chunk_size"):
            chunk_document(make_pages("text"), DOC_ID, COURSE_ID, 0, 0)

    def test_overlap_equals_chunk_size_raises(self) -> None:
        with pytest.raises(ValueError, match="overlap"):
            chunk_document(make_pages("text"), DOC_ID, COURSE_ID, 100, 100)

    def test_overlap_greater_than_chunk_size_raises(self) -> None:
        with pytest.raises(ValueError, match="overlap"):
            chunk_document(make_pages("text"), DOC_ID, COURSE_ID, 100, 200)
