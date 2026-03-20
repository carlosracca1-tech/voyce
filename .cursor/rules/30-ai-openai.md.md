# AI / OpenAI SDK Usage

The repo uses `ai` and `@ai-sdk/openai`.
- Reuse existing AI wrappers/helpers; do not create duplicate client initializations.
- Keep prompts versioned and readable (multi-line templates).
- Ensure deterministic-ish behavior where needed (e.g., structured outputs with zod).
- For any voice/speech features: avoid breaking changes in query params and defaults.

Cost & reliability:
- Avoid unnecessary model calls.
- Cache or reuse results if repo already implements caching.
- Add timeouts / abort controllers for long-running calls where applicable.
