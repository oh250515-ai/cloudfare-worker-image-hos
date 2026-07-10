# Cloudflare Worker Image HOS

Configurable image-to-JSON API on Cloudflare Workers AI. Each request may select a Cloudflare model, prompt, inference parameters and dynamic JSON Schema. The stable envelope preserves all visible text in `rawText`.

## Live documentation

**https://oh250515-ai.github.io/cloudfare-worker-image-hos/**

GitHub Pages is documentation, not the extraction endpoint. Send API calls to the `workers.dev` URL printed by a successful `deploy-worker` job.

## Deploy with one GitHub secret

Create one repository secret named `CLOUDFLARE_CONFIG_JSON`. Both modes are supported:

```json
{"accountId":"...","email":"...","globalApiKey":"..."}
```

or the safer long-term mode:

```json
{"accountId":"...","apiToken":"..."}
```

Then run the GitHub workflow or push to `main`. Full click-by-click setup, credential sources and troubleshooting: **[docs/DEPLOY.md](docs/DEPLOY.md)**.

## Local development

```bash
npm install
npx wrangler login
npm run dev
npm run check
```

```bash
curl -X POST http://localhost:8787/v1/extract \
  -H 'content-type: application/json' \
  -d @examples/winform.json
```

## Production API

```bash
curl https://YOUR-WORKER.workers.dev/health

curl -X POST https://YOUR-WORKER.workers.dev/v1/extract \
  -H 'content-type: application/json' \
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
