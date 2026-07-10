# Cloudflare Worker Image HOS

Configurable image-to-JSON API on Cloudflare Workers AI. The Worker is intentionally thin: every request may select a Cloudflare model, prompt, inference parameters and a dynamic JSON Schema. The response envelope remains stable and can preserve all visible text in `rawText`.

## GitHub Pages

The documentation site is live at:

**https://oh250515-ai.github.io/cloudfare-worker-image-hos/**

Pages is documentation and usage guidance, not the extraction API endpoint. Send API requests to the `workers.dev` URL printed by the successful `deploy-worker` job.

## Quick start

```bash
npm install
npx wrangler login
npm run dev
```

```bash
curl -X POST http://localhost:8787/v1/extract \
  -H 'content-type: application/json' \
  -d @examples/winform.json
```

## Production credential

Create exactly one repository secret named `CLOUDFLARE_CONFIG_JSON`. Paste strict JSON on one line, with normal ASCII double quotes and no trailing comma:

```json
{"accountId":"YOUR_ACCOUNT_ID","apiToken":"YOUR_SCOPED_API_TOKEN"}
```

If a password manager damages JSON formatting, base64-encode that complete JSON object and store the base64 text in the same secret. The workflow accepts either format without printing credentials.

Do not use a Global API Key. Current Wrangler CI officially requires Account ID plus a scoped API Token. A Global API Key additionally requires the Cloudflare user email and grants unnecessarily broad access; Account ID plus Global API Key alone cannot authenticate token creation.

Recommended token permissions: **Account > Workers Scripts > Edit** and **Account > Workers AI > Read** for the target account. Add other permissions only if Cloudflare reports they are required by a feature you enable.

Push to `main`. GitHub Actions tests the code, verifies Cloudflare auth, deploys the Worker, and publishes `site/` to GitHub Pages.

## Use the deployed API

Open the latest successful workflow, then copy the Worker URL from the `Deploy Worker` step. Test it:

```bash
curl https://YOUR-WORKER.workers.dev/health

curl -X POST https://YOUR-WORKER.workers.dev/v1/extract \
  -H 'content-type: application/json' \
  -d @examples/winform.json
```

## Documentation

- [SPEC](SPEC.md)
- [Implementation plan](PLAN.md)
- [API guide](docs/API.md)
- [Cloudflare notes](CLOUDFLARE_DOCS.md)
- [Security](SECURITY.md)
- [Agent handoff](AGENTS.md)
