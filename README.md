# Cloudflare Worker Image HOS

Configurable image-to-JSON API on Cloudflare Workers AI. The Worker is intentionally thin: every request may select a Cloudflare model, prompt, inference parameters and a dynamic JSON Schema. The response envelope remains stable and can preserve all visible text in `rawText`.

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

## Production

Create exactly one repository secret named `CLOUDFLARE_CONFIG_JSON`:

```json
{"accountId":"YOUR_ACCOUNT_ID","apiToken":"YOUR_SCOPED_API_TOKEN"}
```

Push to `main`. GitHub Actions tests the code, deploys the Worker, and publishes `site/` to GitHub Pages. In repository Settings > Pages, select **GitHub Actions** as the source once if GitHub has not enabled it automatically.

## Documentation

- [SPEC](SPEC.md)
- [Implementation plan](PLAN.md)
- [API guide](docs/API.md)
- [Cloudflare notes](CLOUDFLARE_DOCS.md)
- [Security](SECURITY.md)
- [Agent handoff](AGENTS.md)
