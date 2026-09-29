---
name: web-identity-proxy
description: apps/web proxies all API calls and injects a server-only DEMO_USER_ID as X-User-Id; a stopgap until student auth exists
metadata:
  type: project
---

The browser never calls apps/api directly. Next route handlers under `/api/courses/...`
proxy to `API_URL` and add `X-User-Id` from `DEMO_USER_ID` (server-only, never
`NEXT_PUBLIC_`). The API authorises that header as the course **owner**, so every student
is proxied as one owner id.

**Why:** Decided at M3 Task C kickoff (2026-09-29): keep apps/api unchanged; real student
identity/enrolment is a tracked follow-up in docs/milestones/M3-retrieval-chat.md.

**How to apply:** Never expose the id client-side or add a browser→API path. When student
auth lands, replace the env injection in the proxy helper, not the components. The
`anon-XXXX` pseudonym shown in the UI (PR-1) is display-only and is not sent anywhere yet.
Related: [[web-token-gaps]].
