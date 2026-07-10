# API guide

Base URL is the `workers.dev` URL from the deploy job. Send `content-type: application/json`. If the Worker has `API_KEY` set, add `x-api-key: YOUR_KEY` (or `Authorization: Bearer YOUR_KEY`).

## GET /v1/models

```json
{ "default": "@cf/moondream/moondream3.1-9B-A2B", "textDefault": "@cf/meta/llama-3.1-8b-instruct", "codeDefault": "@cf/qwen/qwen2.5-coder-32b-instruct", "allowed": ["*"], "adapters": ["auto","moondream","image-prompt","chat-vision"] }
```

## POST /v1/text and /v1/code

Provide `prompt` (a system prompt is added automatically) or a full `messages` array. `parameters` is forwarded to the model (`max_tokens`, `temperature`, `top_p`, ...).

```json
{ "model": "@cf/meta/llama-3.1-8b-instruct", "prompt": "Viết một câu chào", "parameters": { "max_tokens": 64, "temperature": 0.7 } }
```

Response:

```json
{ "ok": true, "requestId": "uuid", "kind": "text", "model": "@cf/meta/llama-3.1-8b-instruct", "text": "Xin chào!", "output": { }, "usage": { "total_tokens": 42 }, "timingMs": 380 }
```

`/v1/code` is identical but defaults to the code-tuned model and a coding system prompt.

## POST /v1/chat

Requires a `messages` array (OpenAI-style roles).

```json
{ "messages": [ { "role": "system", "content": "You are concise." }, { "role": "user", "content": "What is a Durable Object?" } ], "parameters": { "max_tokens": 256 } }
```

## POST /v1/run

Raw passthrough. Whatever is in `input` goes straight to `env.AI.run(model, input)`. Use this for models with bespoke input shapes.

```json
{ "model": "@cf/baai/bge-m3", "input": { "text": ["cloudflare workers", "serverless"] } }
```

## Benchmark mode

Add `benchmark` to any `/v1/{text,code,chat,run}` request to time and compare models in one call. Capped at 5 models and 5 runs to bound neuron usage.

```json
{ "prompt": "Summarize CAP theorem", "benchmark": { "models": ["@cf/meta/llama-3.1-8b-instruct", "@cf/meta/llama-3.3-70b-instruct-fp8-fast"], "runs": 3 } }
```

Response contains per-run timing/usage and a per-model summary:

```json
{ "ok": true, "mode": "benchmark", "benchmark": { "models": ["..."], "runs": 3, "results": [ { "model": "...", "runs": [ { "run": 1, "ok": true, "timingMs": 410, "usage": {}, "textPreview": "..." } ], "summary": { "attempts": 3, "ok": 3, "avgMs": 402, "minMs": 388, "maxMs": 421 } } ] } }
```

## POST /v1/extract

Image-to-JSON. Provide `imageUrl`, `imageBase64`, or both (base64 preferred, URL fallback). See the model catalog for vision/OCR guidance. Response keeps `result.rawText`, `result.data` (your schema), `result.annotations`, `warnings`, and per-pass `modelMeta`.

## Errors

`INVALID_JSON`, `INVALID_INPUT`, `REQUEST_TOO_LARGE`, `UNAUTHORIZED`, `MODEL_NOT_ALLOWED`, `RUN_FAILED`, `EXTRACTION_FAILED`. Model policy is controlled by `ALLOWED_MODELS`: exact IDs, comma lists, glob (`@cf/mistralai/*`), or `*` for any valid `@cf/author/model`.
