# Cloudflare Worker Image HOS + Workers AI Gateway

A thin Cloudflare Worker over Workers AI for image extraction, text, code, chat and raw model inference. One GitHub secret deploys the Worker and publishes docs plus an interactive playground.

## Live documentation

- Home: https://oh250515-ai.github.io/cloudfare-worker-image-hos/
- Playground: https://oh250515-ai.github.io/cloudfare-worker-image-hos/playground.html
- Model guide: https://oh250515-ai.github.io/cloudfare-worker-image-hos/models.html

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Uptime |
| GET | `/v1/models` | Model defaults and policy |
| POST | `/v1/extract` | URL/base64 image to JSON + rawText |
| POST | `/v1/text` | Text generation |
| POST | `/v1/code` | Code generation |
| POST | `/v1/chat` | Message-based chat |
| POST | `/v1/run` | Raw input for any allowed model |

```bash
BASE=https://YOUR-WORKER.workers.dev

curl -s "$BASE/v1/text" -H 'content-type: application/json' \
  -d '{"model":"@cf/zai-org/glm-4.7-flash","prompt":"Viết một câu chào"}'

curl -s "$BASE/v1/code" -H 'content-type: application/json' \
  -d '{"model":"@cf/zai-org/glm-5.2","prompt":"Viết TypeScript debounce(fn, ms)"}'

curl -s "$BASE/v1/run" -H 'content-type: application/json' \
  -d '{"model":"@cf/openai/gpt-oss-20b","input":{"instructions":"Be concise","input":"Explain CAP theorem"}}'
```

## One-secret deployment

```json
{
  "accountId": "...",
  "apiToken": "...",
  "apiKey": "...",
  "allowedModels": "*",
  "defaultModel": "@cf/mistralai/mistral-small-3.1-24b-instruct",
  "textModel": "@cf/zai-org/glm-4.7-flash",
  "codeModel": "@cf/zai-org/glm-5.2"
}
```

Global-key mode replaces `apiToken` with `email` and `apiGlobalToken`. Production should narrow `allowedModels`; `*` is best for development and benchmarking.

## Docs

- [API](docs/API.md)
- [Model field guide](docs/MODELS.md)
- [Deployment](docs/DEPLOY.md)
- [Security](SECURITY.md)
