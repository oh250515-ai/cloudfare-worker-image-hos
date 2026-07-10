# Cloudflare implementation notes

Checked against Cloudflare documentation and current Workers SDK behavior on 10 July 2026.

## Platform choices

- Workers AI binding exposes inference as `env.AI.run()` and avoids embedding Cloudflare credentials in Worker code.
- Default model: `@cf/moondream/moondream3.1-9B-A2B`, documented for OCR, pointing, visual reasoning and structured output.
- Alternative: `@cf/mistralai/mistral-small-3.1-24b-instruct` for harder vision/reasoning tasks.
- Meta Llama 3.2 Vision requires a one-time license acceptance, so it is not the zero-touch default.
- JSON Mode exists for compatible text-generation models. This implementation also prompt-enforces and normalizes JSON because vision model interfaces differ.

## Free tier

Workers Free currently documents 100,000 requests/day, 128 MB memory and 10 ms CPU per invocation. Workers AI currently includes 10,000 Neurons/day at no charge, reset at 00:00 UTC. Usage must still be monitored.

## CI authentication

The single `CLOUDFLARE_CONFIG_JSON` secret supports:

```json
{"accountId":"...","apiToken":"..."}
```

or:

```json
{"accountId":"...","email":"...","globalApiKey":"..."}
```

Current Workers SDK declares `CLOUDFLARE_API_KEY` plus `CLOUDFLARE_EMAIL` as legacy authentication variables and prefers `CLOUDFLARE_API_TOKEN`. The workflow uses Wrangler CLI directly, not `cloudflare/wrangler-action`, because that action no longer supports Global API Key authentication.

Global mode authenticates Wrangler directly. It deliberately does not mint a token during each build. Cloudflare's current token-via-API guide requires an initial token created with the **Create additional tokens** template; Global API Key is not the documented bootstrap credential for that flow. Creating disposable tokens at every push would also add lifecycle and privilege risk without improving this deployment.

Use Global mode to unblock deployment, then rotate to a scoped API Token when practical. Detailed setup: `docs/DEPLOY.md`.

## GitHub Pages versus Worker

GitHub Pages serves static documentation at https://oh250515-ai.github.io/cloudfare-worker-image-hos/. It does not execute Cloudflare code. The API runs at the `workers.dev` URL emitted by `wrangler deploy`.

## Runtime configuration

`wrangler.jsonc` defines the AI binding, compatibility date and observability. Set runtime secrets with `wrangler secret put API_KEY`. Optional variables are `DEFAULT_MODEL`, `ALLOWED_MODELS`, `MAX_IMAGE_BYTES`, and `FETCH_TIMEOUT_MS`.

## Official references

- https://developers.cloudflare.com/workers-ai/configuration/bindings/
- https://developers.cloudflare.com/workers-ai/features/json-mode/
- https://developers.cloudflare.com/workers-ai/models/moondream3.1-9B-A2B/
- https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/
- https://developers.cloudflare.com/fundamentals/account/find-account-and-zone-ids/
- https://developers.cloudflare.com/fundamentals/api/get-started/create-token/
- https://developers.cloudflare.com/fundamentals/api/how-to/create-via-api/
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/workers-ai/platform/pricing/
