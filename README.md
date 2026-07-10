# Cloudflare Worker Image HOS + Workers AI Gateway

A thin, configurable Cloudflare Worker over Workers AI. It does image-to-JSON extraction and also exposes generic text, code and chat endpoints for any Cloudflare-hosted model, with an in-request benchmark mode. One GitHub secret deploys the Worker and publishes the docs and an interactive playground.

## Deploy to Cloudflare

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/oh250515-ai/cloudfare-worker-image-hos)

Click the button, sign in to any Cloudflare account, and Cloudflare clones this repo, provisions the Workers AI binding and deploys. After deploy, set runtime variables (`API_KEY`, `ALLOWED_MODELS`, `DEFAULT_MODEL`, `DEFAULT_TEXT_MODEL`, `DEFAULT_CODE_MODEL`) in the Worker settings, or use the one-secret GitHub Actions flow below.

## Live pages

- Docs home: https://oh250515-ai.github.io/cloudfare-worker-image-hos/
- Interactive playground: https://oh250515-ai.github.io/cloudfare-worker-image-hos/playground.html
- Model catalog: https://oh250515-ai.github.io/cloudfare-worker-image-hos/models.html

GitHub Pages is documentation and a test client. The API itself is the `workers.dev` URL from the deploy job.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Uptime probe |
| GET | `/v1/models` | Default + text/code defaults, allow policy, adapters |
| POST | `/v1/extract` | Image URL or base64 to JSON with `rawText` and annotations |
| POST | `/v1/text` | Text generation from `prompt` or `messages` |
| POST | `/v1/code` | Code generation (code-tuned default model) |
| POST | `/v1/chat` | Chat completion from `messages` |
| POST | `/v1/run` | Raw passthrough to any model via `input` |

Every `/v1/{text,code,chat,run}` request accepts `benchmark: { models?: string[], runs?: number }` to time and compare models in one call (capped at 5 models and 5 runs).

## Quick curl

```bash
BASE=https://YOUR-WORKER.workers.dev

curl -s $BASE/v1/text -H 'content-type: application/json' \
  -d '{"prompt":"Viết một câu chào ngắn","parameters":{"max_tokens":64}}'

curl -s $BASE/v1/code -H 'content-type: application/json' \
  -d '{"prompt":"TypeScript debounce(fn, ms)","model":"@cf/qwen/qwen2.5-coder-32b-instruct"}'

curl -s $BASE/v1/chat -H 'content-type: application/json' \
  -d '{"messages":[{"role":"user","content":"Explain Workers AI in 2 sentences"}]}'

curl -s $BASE/v1/text -H 'content-type: application/json' \
  -d '{"prompt":"Say hello","benchmark":{"models":["@cf/meta/llama-3.1-8b-instruct","@cf/zai-org/glm-4.7-flash"],"runs":2}}'
```

Add `-H 'x-api-key: YOUR_KEY'` when the Worker has `API_KEY` set.

## One-secret CI deploy

Create a single GitHub secret `CLOUDFLARE_CONFIG_JSON`, then push to `main`:

```json
{"accountId":"...","apiToken":"...","apiKey":"...","allowedModels":"*","defaultModel":"@cf/moondream/moondream3.1-9B-A2B","textModel":"@cf/meta/llama-3.1-8b-instruct","codeModel":"@cf/qwen/qwen2.5-coder-32b-instruct"}
```

Global Key mode replaces `apiToken` with `email` + `apiGlobalToken`. Full setup: [docs/DEPLOY.md](docs/DEPLOY.md).

## Documentation

- [Deployment setup](docs/DEPLOY.md)
- [API guide](docs/API.md)
- [Model catalog: strengths, weaknesses, use cases](docs/MODELS.md)
- [SPEC](SPEC.md) · [Plan](PLAN.md) · [Cloudflare notes](CLOUDFLARE_DOCS.md) · [Security](SECURITY.md) · [Agent handoff](AGENTS.md)
