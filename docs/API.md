# API guide

Base URL is the `workers.dev` URL printed by deployment. Send `content-type: application/json`; add `x-api-key` or `Authorization: Bearer` when runtime `API_KEY` is enabled.

## Endpoint map

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Uptime probe |
| GET | `/v1/models` | Defaults, model policy and vision adapters |
| POST | `/v1/text` | Text generation from prompt or messages |
| POST | `/v1/code` | Coding prompt with code-focused system instruction |
| POST | `/v1/chat` | OpenAI-style message conversation |
| POST | `/v1/run` | Raw `env.AI.run(model,input)` passthrough |
| POST | `/v1/extract` | Image URL/base64 to `rawText`, data and annotations |

## Text

```bash
curl -s "$BASE/v1/text" -H 'content-type: application/json' \
  -H 'x-api-key: YOUR_KEY' \
  -d '{"model":"@cf/zai-org/glm-4.7-flash","prompt":"Viết thông báo bảo trì 80 từ","parameters":{"max_tokens":200,"temperature":0.3}}'
```

You may replace `prompt` with a full `messages` array. `parameters` is forwarded to the selected model.

## Code

```bash
curl -s "$BASE/v1/code" -H 'content-type: application/json' \
  -d '{"model":"@cf/zai-org/glm-5.2","prompt":"Viết TypeScript retry helper có exponential backoff và unit test","parameters":{"max_tokens":1200}}'
```

The endpoint adds a coding system instruction when given a plain prompt. For complete control, send `messages`.

## Chat

```bash
curl -s "$BASE/v1/chat" -H 'content-type: application/json' \
  -d '{"model":"@cf/zai-org/glm-4.7-flash","messages":[{"role":"system","content":"Trả lời ngắn."},{"role":"user","content":"Durable Objects giải quyết việc gì?"}],"parameters":{"max_tokens":250}}'
```

## Raw model run

Use `/v1/run` when a model has a bespoke schema. `input` is forwarded unchanged after model-policy validation.

```bash
curl -s "$BASE/v1/run" -H 'content-type: application/json' \
  -d '{"model":"@cf/openai/gpt-oss-20b","input":{"instructions":"Trả lời bằng tiếng Việt","input":"Phân tích ưu nhược điểm event sourcing"}}'
```

Embeddings example:

```bash
curl -s "$BASE/v1/run" -H 'content-type: application/json' \
  -d '{"model":"@cf/baai/bge-m3","input":{"text":["Cloudflare Workers","serverless edge"]}}'
```

## Response

```json
{
  "ok": true,
  "requestId": "uuid",
  "kind": "text",
  "model": "@cf/zai-org/glm-4.7-flash",
  "text": "...",
  "output": {},
  "usage": {},
  "timingMs": 420,
  "metadata": {}
}
```

`output` always preserves the original provider response. `text` is a convenience extraction and may be null for embeddings or non-text models.

## Benchmark

Add `benchmark` to `/v1/text`, `/v1/code`, `/v1/chat` or `/v1/run`. Limits: five models and five runs.

```json
{
  "prompt": "Tóm tắt CAP theorem",
  "benchmark": {
    "models": ["@cf/zai-org/glm-4.7-flash", "@cf/meta/llama-3.3-70b-instruct-fp8-fast"],
    "runs": 3
  }
}
```

## Image extraction

Supply `imageUrl`, `imageBase64`, or both. Base64 takes priority; an invalid base64 value falls back to URL. Choose a vision-capable model and matching adapter. See [MODELS.md](MODELS.md).

## Model policy

`ALLOWED_MODELS` accepts exact IDs, comma lists, glob rules such as `@cf/mistralai/*`, or `*`. Wildcard still requires the safe Cloudflare ID shape `@cf/author/model`; external provider strings remain rejected.

## Errors

`INVALID_JSON`, `INVALID_INPUT`, `REQUEST_TOO_LARGE`, `UNAUTHORIZED`, `MODEL_NOT_ALLOWED`, `RUN_FAILED`, `EXTRACTION_FAILED`.
