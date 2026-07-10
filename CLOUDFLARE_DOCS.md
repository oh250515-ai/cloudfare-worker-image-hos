# Cloudflare implementation notes

Checked against Cloudflare documentation and current Workers SDK behavior on 10 July 2026.

## Platform choices

- Workers AI is invoked through the `AI` binding as `env.AI.run()`.
- Default model: `@cf/moondream/moondream3.1-9B-A2B`, documented for OCR, pointing, visual reasoning and structured output.
- Runtime model allowlist, default model and limits can be supplied from the one GitHub secret without committing them.
- JSON Mode varies by model, so the Worker also prompt-enforces and normalizes JSON.

## One-secret CI configuration

`CLOUDFLARE_CONFIG_JSON` supports scoped API Token or email + Global API Key authentication, plus optional `apiKey`, `allowedModels`, `defaultModel`, `maxImageBytes`, `fetchTimeoutMs`, `testImageUrl`, and `workersSubdomain` fields. `API_KEY` is stored with `wrangler secret put`; non-secret runtime values are written only to an ephemeral CI Wrangler config.

Wrangler prefers `CLOUDFLARE_API_TOKEN`. Current Workers SDK still exposes legacy `CLOUDFLARE_API_KEY` with `CLOUDFLARE_EMAIL`; the workflow calls Wrangler directly because wrangler-action does not support Global Key auth.

## workers.dev automation

Cloudflare currently documents:

- `PUT /accounts/{account_id}/workers/subdomain` to create an account Workers subdomain. CI calls it only when `workersSubdomain` is supplied. Error code 10036 (`account_has_subdomain`) is idempotent success.
- `POST /accounts/{account_id}/workers/scripts/{script_name}/subdomain` with `{ "enabled": true, "previews_enabled": false }` to expose the deployed script on workers.dev. CI calls it after upload because the script must exist.

The API helper selects Bearer Token auth or legacy `X-Auth-Email`/`X-Auth-Key` headers from the already-masked environment. Tokens need adequate Workers Scripts permissions.

## Post-deploy verification

The deploy command is piped through `tee` with `pipefail`; CI extracts the workers.dev URL and refuses to continue if none is printed. The smoke test checks `/health`, then sends the example extraction request with the configured public image URL and optional `x-api-key`. It does not print extracted content.

## Free tier

Workers Free currently documents 100,000 requests/day, 128 MB memory and 10 ms CPU per invocation. Workers AI currently includes 10,000 Neurons/day at no charge, reset at 00:00 UTC. Each deployment smoke test consumes one inference.

## Official references

- https://developers.cloudflare.com/workers-ai/configuration/bindings/
- https://developers.cloudflare.com/workers-ai/features/json-mode/
- https://developers.cloudflare.com/workers-ai/models/moondream3.1-9B-A2B/
- https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/subdomain/methods/create/
- https://developers.cloudflare.com/api/node/resources/workers/subresources/subdomains/methods/update/
- https://developers.cloudflare.com/workers/configuration/routing/workers-dev/
- https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/workers-ai/platform/pricing/
