# Cloudflare Worker Image HOS

Configurable image-to-JSON API on Cloudflare Workers AI. Each request may select a Cloudflare model, prompt, inference parameters and dynamic JSON Schema. The stable envelope preserves all visible text in `rawText`.

## Live documentation

**https://oh250515-ai.github.io/cloudfare-worker-image-hos/**

GitHub Pages is documentation, not the extraction endpoint. The API is the `workers.dev` URL captured by the deploy job.

## One-secret deployment

`CLOUDFLARE_CONFIG_JSON` now contains deployment credentials plus optional runtime and smoke-test settings:

```json
{"accountId":"...","apiToken":"...","apiKey":"...","allowedModels":"@cf/moondream/moondream3.1-9B-A2B","defaultModel":"@cf/moondream/moondream3.1-9B-A2B","maxImageBytes":"8388608","fetchTimeoutMs":"12000","testImageUrl":"https://public.example/test.png","workersSubdomain":"my-team"}
```

Global Key auth remains supported by replacing `apiToken` with `email` and `globalApiKey`. Every runtime field is optional; missing fields are skipped. Full field reference and click-by-click credential setup: **[docs/DEPLOY.md](docs/DEPLOY.md)**.

On every `main` push, Actions runs checks, prepares runtime config without committing secrets, optionally creates the account workers.dev subdomain, deploys, enables the script route, applies `API_KEY`, then smoke-tests both `/health` and `/v1/extract`.

## Local development

```bash
npm install
npx wrangler login
npm run dev
npm run check
```

## Production API

```bash
curl https://YOUR-WORKER.workers.dev/health

curl -X POST https://YOUR-WORKER.workers.dev/v1/extract \
  -H 'content-type: application/json' \
  -H 'x-api-key: YOUR_RUNTIME_API_KEY' \
  -d @examples/winform.json
```

## Documentation

- [Deployment setup](docs/DEPLOY.md)
- [SPEC](SPEC.md)
- [Implementation plan](PLAN.md)
- [API guide](docs/API.md)
- [Cloudflare notes](CLOUDFLARE_DOCS.md)
- [Security](SECURITY.md)
- [Agent handoff](AGENTS.md)
