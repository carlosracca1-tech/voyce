# Next.js 15 / App Router Rules

Assume App Router unless the repo shows Pages Router.
- Do not mix client/server imports incorrectly.
- Server-only code must stay server-only: never import DB/OpenAI/server utilities into client components.

Route handlers (app/api/**/route.ts):
- Return a consistent shape: { ok: boolean, data?: any, error?: { code: string, message: string } }
- Use correct status codes (400, 401, 403, 404, 500).
- Prefer `export const runtime = "nodejs"` for DB/network heavy routes unless repo standard differs.
- For cron/ingest routes: require an auth secret header if the repo already uses one.

Do not change caching flags (dynamic/revalidate) unless necessary; follow existing patterns.
