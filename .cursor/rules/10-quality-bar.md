# Quality Bar (Non-negotiable)

Before proposing changes:
- Identify current patterns in the repo and follow them (naming, folder layout, conventions).

Every change must keep the project healthy:
- `pnpm lint` must pass.
- Add/maintain TypeScript correctness. Avoid `any`. If unavoidable, isolate and justify.

When adding new scripts:
- If `typecheck` is missing, propose adding:
  - "typecheck": "tsc --noEmit"
  - and run it mentally / ensure it will pass.

Safety:
- Validate all external inputs (query/body/headers) with zod when possible.
- Never log secrets (tokens, API keys, cookies) or full request payloads.
- Prefer explicit error handling over silent failures.
