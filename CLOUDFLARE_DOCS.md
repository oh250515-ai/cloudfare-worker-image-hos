# Cloudflare implementation notes

Checked against Cloudflare's current documentation on 10 July 2026.

## Platform choices

- Workers AI binding exposes inference as `env.AI.run()` and avoids storing an account token inside Worker code.
- Default model: `@cf/moondream/moondream3.1-9B-A2B`, documented for OCR, pointing, visual reasoning and structured output.
- Alternative: `@cf/mistralai/mistral-small-3.1-24b-instruct` for harder vision/reasoning tasks. Model-specific request fields still apply.
- Meta Llama 3.2 Vision requires a one-time license acceptance, so it is not the zero-touch default.
- JSON Mode exists for compatible text-generation models. This implementation also prompt-enforces and normalizes JSON because image-to-text model interfaces differ.

## Free tier

Workers Free currently documents 100,000 requests/day, 128 MB memory and 10 ms CPU per invocation. Workers AI currently includes 10,000 Neurons/day at no charge, reset at 00:00 UTC. AI inference and remote waiting do not justify adding a server or queue for the MVP, but usage must be monitored.

## Deployment

Cloudflare supports native Git integration through Workers Builds and external CI/CD through GitHub Actions. This repo intentionally uses GitHub Actions because the requirement is one JSON secret and a visible workflow. Wrangler needs account ID and a scoped API token in non-interactive CI.

## Runtime configuration

`wrangler.jsonc` defines the AI binding, compatibility date and observability. Set runtime secrets with `wrangler secret put API_KEY`. Optional plain variables are `DEFAULT_MODEL`, `ALLOWED_MODELS`, `MAX_IMAGE_BYTES`, and `FETCH_TIMEOUT_MS`.

## Official references

- https://developers.cloudflare.com/workers-ai/configuration/bindings/
- https://developers.cloudflare.com/workers-ai/features/json-mode/
- https://developers.cloudflare.com/workers-ai/models/moondream3.1-9B-A2B/
- https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/
- https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/workers-ai/platform/pricing/
