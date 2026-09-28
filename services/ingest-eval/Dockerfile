# CourseMind ingestion service (Python FastAPI) — M2 Task E6.
# Build context: services/ingest-eval
#   docker build -t coursemind-ingest-eval services/ingest-eval
#
# Runtime: uvicorn serving coursemind_ingest.app:app on :8000.
# Config comes exclusively from env at runtime (SR-4) — no secrets baked in.

FROM python:3.12-slim AS base

# - PYTHONUNBUFFERED: stream logs immediately (observability, CLAUDE.md §6)
# - PIP_NO_CACHE_DIR: keep the image small
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# System build deps: psycopg[binary] and pymupdf ship wheels, but keep
# build-essential available for any source builds on slim, then drop it.
# (Kept minimal; most deps are manylinux wheels.)

# Copy only dependency metadata first for better layer caching, then install.
# We copy the source too because the project uses hatchling (needs the package
# tree present to build the wheel for `pip install .`).
COPY pyproject.toml ./
COPY src ./src

# Install the package (runtime deps only — dev tooling lives in CI, not the image).
RUN pip install .

# Non-root runtime user (least privilege).
RUN useradd --create-home --uid 10001 appuser
# The shared uploads volume is mounted here; ensure it exists and is writable.
RUN mkdir -p /uploads && chown -R appuser:appuser /uploads /app
USER appuser

ENV UPLOAD_DIR=/uploads
EXPOSE 8000

# Lightweight liveness check against the FastAPI /health route.
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=5 \
    CMD python -c "import urllib.request,sys; sys.exit(0) if urllib.request.urlopen('http://127.0.0.1:8000/health').status==200 else sys.exit(1)"

CMD ["uvicorn", "coursemind_ingest.app:app", "--host", "0.0.0.0", "--port", "8000"]
