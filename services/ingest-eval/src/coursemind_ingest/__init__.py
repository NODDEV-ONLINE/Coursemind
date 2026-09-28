"""CourseMind ingestion + evaluation service.

Parse (PyMuPDF / python-pptx) -> chunk (page/slide metadata) -> embed
(text-embedding-004, 768-dim) -> store (Postgres + pgvector).

Pipeline implemented in Milestone 2 Task C. This package is the directory
skeleton (Task A).
"""

__version__ = "0.0.0"
