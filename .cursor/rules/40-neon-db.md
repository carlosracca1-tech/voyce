# Neon Postgres (serverless) Rules

DB access uses `@neondatabase/serverless`.
- Never change schema/table names unless explicitly requested.
- Use parameterized queries only.
- When inserting content (articles/chunks), implement idempotency:
  - stable dedupe key (url/guid/canonical id)
  - use ON CONFLICT where appropriate
- In ingestion, prefer partial success:
  - one feed failing should not block others
  - return summary: inserted/skipped/errors per feed
