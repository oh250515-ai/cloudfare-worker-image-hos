# Agent implementation handoff

Read `SPEC.md`, `PLAN.md`, `docs/API.md`, `docs/DEPLOY.md`, `CLOUDFLARE_DOCS.md`, and `SECURITY.md` before changing code. Preserve the stable response envelope while keeping extraction fields dynamic. Never hardcode WinForms fields into the Worker.

Before every commit run `npm run check`. For model changes, verify the exact model ID and input contract in current Cloudflare docs. Add an adapter rather than scattering model-specific conditions through the request handler. Never log image bytes, prompts, API keys, credentials, or extracted text.

For release: update docs and compatibility date when required, push `main`, then confirm `test`, `deploy-worker`, and `deploy-pages` are green. The deploy job now creates/configures workers.dev when requested, captures the API URL, applies runtime secrets, and automatically validates `/health` plus a real `/v1/extract` response. Do not repeat the smoke test manually unless diagnosing a failure. Record the Worker and Pages URLs in README when stable.
