# CourseMind — Software Requirements Specification (SRS)

**Status:** Draft v1.0
**Author:** Reiker Nodd
**Last updated:** 2026-09-25
**Standard:** loosely follows IEEE 830 structure
**Related docs:** [PRD](./PRD.md) · [SDD](./SDD.md) · [ADR-0001](./adr/0001-vector-store-pgvector-vs-dedicated.md)

---

## 1. Introduction

### 1.1 Purpose

This document specifies the functional and non-functional requirements for
CourseMind v1 (MVP). It is the contract between "what CourseMind does" (this SRS)
and "how it is built" (the [SDD](./SDD.md)).

### 1.2 Scope

CourseMind ingests a lecturer's course materials, answers student questions solely
from those materials with citations, refuses off-syllabus questions, measures its
own accuracy against a curated question set, gates CI on that accuracy, and exposes
the course over the Model Context Protocol (MCP).

### 1.3 Definitions

| Term | Meaning |
| --- | --- |
| **Course** | A set of uploaded materials owned by one lecturer |
| **Chunk** | A retrievable unit of text (with page/slide metadata) |
| **Citation** | A reference to the source document + page/slide backing a claim |
| **Refusal** | An explicit "not in your course materials" response |
| **Test set** | Lecturer-curated Q&A pairs used to score accuracy |
| **Accuracy gate** | CI check that fails the build if accuracy drops below threshold |
| **MCP** | Model Context Protocol; standard for exposing tools to LLM clients |

### 1.4 Requirement IDs

- `FR-*` functional, `NFR-*` non-functional, `PR-*` privacy, `SR-*` security.
- Priority: **M** (MVP/must), **S** (should), **C** (stretch/could).

---

## 2. Overall description

### 2.1 Product perspective

A polyglot system: a TypeScript web app + API + MCP server, backed by a Python
ingestion/evaluation service, over a single PostgreSQL (with pgvector) database.
See [SDD §Architecture](./SDD.md#3-architecture-overview).

### 2.2 User classes

Lecturer, Student, Tutor/TA, MCP client (machine). Roles from [PRD §4](./PRD.md#4-target-users--personas).

### 2.3 Operating environment

- Client: modern mobile/desktop browser; must degrade to low-bandwidth text mode.
- Server: Linux container(s); managed Postgres; one LLM provider + fallback.

### 2.4 Design & implementation constraints

- TypeScript for web/API/MCP; Python for ingestion + evaluation.
- Single Postgres instance with pgvector (per [ADR-0001](./adr/0001-vector-store-pgvector-vs-dedicated.md)).
- Must operate within free/low-cost hosting tiers for the pilot.

---

## 3. Functional requirements — Ingestion

| ID | Priority | Requirement |
| --- | --- | --- |
| FR-1 | M | A lecturer can upload PDF and slide files (PDF, PPTX) to a course. |
| FR-2 | M | The system parses documents preserving page/slide numbers and text order. |
| FR-3 | M | The system splits documents into chunks with source metadata (doc id, page/slide, char range). |
| FR-4 | M | The system generates embeddings for each chunk and stores them. |
| FR-5 | M | Ingestion status (queued / processing / ready / failed) is visible to the lecturer. |
| FR-6 | S | Re-uploading a document replaces its chunks without duplicating them (idempotent by content hash). |
| FR-7 | C | The lecturer can compare chunking strategies and see retrieval hit-rates. |

## 4. Functional requirements — Retrieval & answering

| ID | Priority | Requirement |
| --- | --- | --- |
| FR-8 | M | A student can ask a free-text question scoped to one course. |
| FR-9 | M | The system retrieves the most relevant chunks (vector search + optional rerank). |
| FR-10 | M | The answer is generated **only** from retrieved chunks (grounded generation). |
| FR-11 | M | Every substantive claim includes a citation to source document + page/slide. |
| FR-12 | M | If no sufficiently relevant chunk is found, the system returns an explicit refusal. |
| FR-13 | M | Answers stream token-by-token to the client. |
| FR-14 | M | A **low-data text mode** returns compact text answers without heavy assets. |
| FR-15 | S | The student can open a cited source to see the surrounding passage. |
| FR-16 | S | The student can rate an answer (thumbs up/down); down-votes are logged. |
| FR-17 | C | Down-voted answers can be promoted into the test set by a tutor. |
| FR-18 | C | Semantic cache returns cached answers for near-duplicate questions. |

## 5. Functional requirements — Evaluation & CI gate

| ID | Priority | Requirement |
| --- | --- | --- |
| FR-19 | M | A lecturer/tutor can maintain a test set of 50–100 Q&A pairs per course. |
| FR-20 | M | The system scores generated answers against the test set (correctness + citation presence). |
| FR-21 | M | An accuracy dashboard shows current and historical scores per course. |
| FR-22 | M | A CI job runs the test set and **fails the build** if accuracy drops below the configured threshold. |
| FR-23 | S | Evaluation runs per-PR and nightly. |
| FR-24 | C | Prompt-injection test cases are part of the evaluation suite. |

## 6. Functional requirements — MCP server & admin

| ID | Priority | Requirement |
| --- | --- | --- |
| FR-25 | M | The system exposes an MCP server with a `search_course` tool returning cited snippets. |
| FR-26 | S | MCP exposes `get_lecture_outline`. |
| FR-27 | C | MCP exposes `quiz_me`. |
| FR-28 | M | MCP access is authenticated and scoped to permitted courses. |
| FR-29 | M | A lecturer dashboard shows accuracy, cost per question, and usage. |
| FR-30 | M | Per-student rate limits are enforced on the chat/answer endpoints. |

---

## 7. Privacy & data protection requirements

> **This is the requirement the architecture is built around** (per portfolio plan).
> CourseMind processes **student questions**, which are personal data under
> Nigeria's **NDPA 2023**. Privacy is designed in, not bolted on.

| ID | Priority | Requirement |
| --- | --- | --- |
| **PR-1** | **M** | **Data minimisation:** collect only what is required to answer and evaluate. No student real name is required to ask a question; a pseudonymous student id is sufficient. |
| PR-2 | M | **Consent:** students must give informed consent before their questions are stored for evaluation/analytics; consent is recorded with timestamp and version. |
| PR-3 | M | **Purpose limitation:** stored questions are used only to answer, to improve retrieval, and (if opted in) to build the test set — not for any other purpose. |
| PR-4 | M | **Retention:** raw student questions are retained for a bounded window (default 90 days) then deleted or anonymised. Retention window is configurable per institution. |
| PR-5 | M | **Right to erasure:** a student can request deletion of their question history; the system supports hard-deleting a student's records. |
| PR-6 | M | **Access control:** lecturers/tutors see aggregate analytics; raw per-student question logs are access-restricted and audited. |
| PR-7 | S | **Data residency awareness:** document where data and LLM processing occur; disclose cross-border LLM calls in the privacy notice. |
| PR-8 | S | **PII redaction:** best-effort redaction of obvious PII (phone, email, matric number) before logging questions for analytics. |
| PR-9 | M | **Transparency:** a privacy notice states what is collected, why, retention, and third parties (LLM/embedding providers). |

---

## 8. Security requirements

| ID | Priority | Requirement |
| --- | --- | --- |
| SR-1 | M | Authentication for lecturers and students; role-based authorization. |
| SR-2 | M | Course isolation: a student/MCP client can only access courses they are permitted to. |
| SR-3 | M | Uploaded document text is treated as **untrusted** and never executed; guard against prompt injection in the grounding prompt. |
| SR-4 | M | Secrets (LLM keys, DB creds) are never exposed to the client and are stored outside source control. |
| SR-5 | M | Rate limiting and abuse protection on public endpoints. |
| SR-6 | S | Audit log for administrative and data-access actions. |
| SR-7 | S | Prompt-injection regression tests in CI. |

---

## 9. Non-functional requirements

### 9.1 Performance

| ID | Priority | Requirement |
| --- | --- | --- |
| NFR-1 | M | p95 time-to-first-token < 3 s on a simulated 3G connection. |
| NFR-2 | M | Low-data text answer payload < 30 KB. |
| NFR-3 | S | Ingestion of a 50-page PDF completes in < 2 minutes. |

### 9.2 Reliability

| ID | Priority | Requirement |
| --- | --- | --- |
| NFR-4 | M | LLM provider failure falls back to a secondary provider or a graceful error. |
| NFR-5 | M | Failed ingestion is retryable and reports the failure reason. |

### 9.3 Observability

| ID | Priority | Requirement |
| --- | --- | --- |
| NFR-6 | M | Each answered question emits a trace with latency, tokens, cost, and retrieval hits. |
| NFR-7 | M | Cost per question and per 1,000 questions is queryable/dashboarded. |

### 9.4 Cost

| ID | Priority | Requirement |
| --- | --- | --- |
| NFR-8 | M | The system runs within free/low-cost tiers for a pilot of ~60 students. |

### 9.5 Accessibility & i18n

| ID | Priority | Requirement |
| --- | --- | --- |
| NFR-9 | S | UI meets WCAG 2.1 AA basics (contrast, keyboard nav, labels). |
| NFR-10 | C | UI strings are localisable (English default). |

### 9.6 Maintainability

| ID | Priority | Requirement |
| --- | --- | --- |
| NFR-11 | M | Automated tests for API, retrieval, and evaluation logic run in CI. |
| NFR-12 | M | One-command local run (documented in README). |

---

## 10. Acceptance criteria (MVP done = )

- A lecturer can upload a PDF and reach "ready" status. *(FR-1..FR-5)*
- A student question returns a cited, streamed answer. *(FR-8..FR-13)*
- An off-syllabus question is refused ≥ 95% of the time on the test set. *(FR-12, §7 PRD metrics)*
- Accuracy dashboard shows a score; CI fails when accuracy < threshold. *(FR-19..FR-22)*
- `search_course` is callable over MCP with auth. *(FR-25, FR-28)*
- Privacy: consent recorded, retention job runs, erasure works. *(PR-2, PR-4, PR-5)*

## 11. Traceability (requirements → milestones)

| Milestone | Requirements |
| --- | --- |
| Ingestion (wk 3–4) | FR-1..FR-6, PR-8, SR-3 |
| Retrieval + chat (wk 5–6) | FR-8..FR-16, NFR-1, NFR-2 |
| Accuracy + CI (wk 7) | FR-19..FR-23, NFR-11 |
| MCP (wk 8) | FR-25..FR-28, SR-2 |
| Pilot + observability (wk 9–10) | PR-1..PR-9, NFR-6, NFR-7, SR-5 |
