# Agent implementation handoff

Read `SPEC.md`, `PLAN.md`, `docs/API.md`, `CLOUDFLARE_DOCS.md`, and `SECURITY.md` before changing code. Preserve the stable response envelope while keeping extraction fields dynamic. Never hardcode WinForms fields into the Worker.

Before every commit run `npm run check`. For model changes, verify the exact model ID and input contract in current Cloudflare docs. Add an adapter rather than scattering model-specific conditions through the request handler. Never log image bytes, prompts, API keys, or extracted text.

For release: update docs and compatibility date when required, push `main`, confirm `test`, `deploy-worker`, and `deploy-pages`, call `/health`, run `examples/winform.json` against a safe public test image, then record the Worker and Pages URLs in README.
