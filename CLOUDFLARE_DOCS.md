# Cloudflare implementation notes

Checked against Cloudflare's current documentation on 10 July 2026.

## Platform choices

- Workers AI binding exposes inference as `env.AI.run()` and avoids storing an account token inside Worker code.
- Default model: `@cf/moondream/moondream3.1-9B-A2B`, documented for OCR, pointing, visual reasoning and structured output.
- Alternative: `@cf/mistralai/mistral-small-3.1-24b-instruct` for harder vision/reasoning tasks. Model-specific request fields still apply.
- Meta Llama 3.2 Vision requires a one-time license acceptance, so it is not the zero-touch default.
- JSON Mode exists for compatible text-generation models. This implementation also prompt-enforces and normalizes JSON because image-to-text model interfaces differ.

## Free tier

Workers Free currently documents 100,000 requests/day, 128 MB memory and 10 ms CPU per invocation. Workers AI currently includes 10,000 Neurons/day at no charge, reset at 00:00 UTC. Usage must still be monitored.

## CI authentication

Current Cloudflare documentation for non-interactive Wrangler CI requires these two values:

1. Cloudflare Account ID.
2. Scoped Cloudflare API Token.

The repo stores both inside one GitHub Secret named `CLOUDFLARE_CONFIG_JSON`:

```json
{"accountId":"YOUR_ACCOUNT_ID","apiToken":"YOUR_SCOPED_API_TOKEN"}
```

The JSON must use ASCII double quotes, contain no comments and have no trailing comma. The workflow also accepts base64-encoded JSON and validates each field without printing secrets.

A Global API Key is not interchangeable with an API Token in current Wrangler CI. Global-key API authentication also needs `X-Auth-Email`; therefore Account ID plus Global API Key alone is insufficient. Automatically minting a new long-lived API token during every deployment is intentionally not implemented: it needs broader credential access, proliferates tokens and defeats least privilege. Create one scoped token in Cloudflare Dashboard and rotate it deliberately.

## GitHub Pages versus Worker

GitHub Pages serves the static documentation at https://oh250515-ai.github.io/cloudfare-worker-image-hos/. It does not execute Cloudflare code and is not the image extraction endpoint. The API runs at the `workers.dev` URL emitted by `wrangler deploy`.

## Runtime configuration

`wrangler.jsonc` defines the AI binding, compatibility date and observability. Set runtime secrets with `wrangler secret put API_KEY`. Optional plain variables are `DEFAULT_MODEL`, `ALLOWED_MODELS`, `MAX_IMAGE_BYTES`, and `FETCH_TIMEOUT_MS`.

## Official references

- https://developers.cloudflare.com/workers-ai/configuration/bindings/
- https://developers.cloudflare.com/workers-ai/features/json-mode/
- https://developers.cloudflare.com/workers-ai/models/moondream3.1-9B-A2B/
- https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/
- https://developers.cloudflare.com/fundamentals/api/get-started/create-token/
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/workers-ai/platform/pricing/
