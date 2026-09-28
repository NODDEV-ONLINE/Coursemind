"""Shared pytest fixtures for the coursemind_ingest test suite."""

from __future__ import annotations

from pathlib import Path

import pytest

FIXTURES_DIR = Path(__file__).parent / "fixtures"
SAMPLE_PDF = FIXTURES_DIR / "sample.pdf"
SAMPLE_PPTX = FIXTURES_DIR / "sample.pptx"


@pytest.fixture(scope="session")
def sample_pdf() -> Path:
    """Return the path to the committed sample PDF fixture (E1)."""
    if not SAMPLE_PDF.exists():
        pytest.fail(
            f"Fixture not found: {SAMPLE_PDF}\n"
            "Run: python tests/fixtures/generate_fixtures.py"
        )
    return SAMPLE_PDF


@pytest.fixture(scope="session")
def sample_pptx() -> Path:
    """Return the path to the committed sample PPTX fixture (E1)."""
    if not SAMPLE_PPTX.exists():
        pytest.fail(
            f"Fixture not found: {SAMPLE_PPTX}\n"
            "Run: python tests/fixtures/generate_fixtures.py"
        )
    return SAMPLE_PPTX
