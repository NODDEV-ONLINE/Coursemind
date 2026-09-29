---
name: dev-box-docker
description: Docker capabilities and gaps on the CourseMind dev box (compose v2 / buildx missing)
metadata:
  type: reference
---

Dev box Docker state (as of 2026-09-28):

- Docker daemon + CLI present (`docker build`, `docker run` work).
- **No `docker compose` v2 plugin** — `docker compose ...` errors with "unknown command: compose". Validate compose files with `python -c 'import yaml; yaml.safe_load(open(f))'` and by reading, not by running `docker compose config`.
- **No buildx / BuildKit** — `DOCKER_BUILDKIT=1` fails with "buildx component is missing or broken". Use `DOCKER_BUILDKIT=0` (legacy builder). Consequence: **do not use `RUN --mount=type=cache` or other BuildKit-only syntax in Dockerfiles** meant to build here — the legacy builder can't parse them. Both project Dockerfiles were kept BuildKit-free for this reason.

**How to apply:** When verifying infra changes locally, `docker build` works (legacy builder), but full `docker compose up` cannot be exercised on this box — mark end-to-end compose orchestration as unverified and rely on YAML validation + individual image builds.
