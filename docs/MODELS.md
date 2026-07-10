# Cloudflare Workers AI model field guide

Practical selection guide checked against Cloudflare's official model catalog and changelog on 10 July 2026. Model availability and input schemas change, so verify the exact model page before production rollout.

Set `allowedModels` to an exact list, glob, or `*`. The wildcard still accepts only valid Cloudflare-hosted IDs shaped like `@cf/author/model`.

## Quick selection

| Job | Start with | Why |
| --- | --- | --- |
| Cheap multilingual text | `@cf/zai-org/glm-4.7-flash` | 131k context, 100+ languages, reasoning and tools |
| General reasoning | `@cf/openai/gpt-oss-20b` | 128k, agentic reasoning, low output price |
| Hard coding | `@cf/zai-org/glm-5.2` | Flagship agentic coding, 262k |
| Code + screenshots | `@cf/moonshotai/kimi-k2.7-code` | Vision, tools, structured output, 262k |
| Dense screenshot OCR | `@cf/mistralai/mistral-small-3.1-24b-instruct` | Vision + text, better fit than small OCR VLMs |
| Balanced multimodal | `@cf/google/gemma-4-26b-a4b-it` | Vision + reasoning, 256k, strong price |
| Native image reasoning | `@cf/meta/llama-4-scout-17b-16e-instruct` | Multimodal native, 131k, tools |
| Sparse/cheap OCR | `@cf/moondream/moondream3.1-9B-A2B` | Fast OCR, point and detect |

## Text and chat

### `@cf/zai-org/glm-4.7-flash`

**Strengths:** fast, multilingual including Vietnamese, 131,072-token context, reasoning and function calling.  
**Weaknesses:** text-only; not the choice for screenshots.  
**Use:** default chat, summarization, classification, extraction from long text.

```bash
curl -s "$BASE/v1/text" -H 'content-type: application/json' \
  -H 'x-api-key: YOUR_KEY' \
  -d '{"model":"@cf/zai-org/glm-4.7-flash","prompt":"Tóm tắt văn bản sau thành 3 ý: ...","parameters":{"max_tokens":300,"temperature":0.2}}'
```

### `@cf/openai/gpt-oss-20b`

**Strengths:** reasoning, agentic tasks, 128k context, function calling.  
**Weaknesses:** model-specific Responses-style input instead of ordinary chat messages.  
**Use:** analysis, decision support, tool workflows. Call through `/v1/run`.

```bash
curl -s "$BASE/v1/run" -H 'content-type: application/json' \
  -d '{"model":"@cf/openai/gpt-oss-20b","input":{"instructions":"Trả lời ngắn gọn","input":"Giải thích CAP theorem"}}'
```

### `@cf/meta/llama-3.3-70b-instruct-fp8-fast`

**Strengths:** strong instruction following and tool calling.  
**Weaknesses:** 24k context and more expensive than small chat models.  
**Use:** higher-quality drafting and reasoning where long context is unnecessary.

## Code

### `@cf/zai-org/glm-5.2`

**Strengths:** flagship agentic coding model, 262,144-token context, reasoning and functions.  
**Weaknesses:** expensive and slower; wasteful for tiny snippets.  
**Use:** repo-scale review, complex refactors, coding agents.

```bash
curl -s "$BASE/v1/code" -H 'content-type: application/json' \
  -d '{"model":"@cf/zai-org/glm-5.2","prompt":"Review module này, tìm race condition và viết patch: ...","parameters":{"max_tokens":2000}}'
```

### `@cf/moonshotai/kimi-k2.7-code`

**Strengths:** 262,144-token context, vision, structured output and multi-turn tool calling.  
**Weaknesses:** high price and latency.  
**Use:** large repositories, agentic workflows, code plus UI screenshot analysis.

## Vision and OCR

### `@cf/mistralai/mistral-small-3.1-24b-instruct`

**Strengths:** vision + text, 128k context, structured extraction.  
**Weaknesses:** slower than small VLMs; image input should use the `chat-vision` adapter.  
**Use:** dense Vietnamese WinForms screenshots, forms, documents and image reasoning.

```bash
curl -s "$BASE/v1/extract" -H 'content-type: application/json' \
  -d '{"model":"@cf/mistralai/mistral-small-3.1-24b-instruct","adapter":"chat-vision","imageUrl":"https://example.com/screen.png","prompt":"OCR toàn bộ và trích trạng thái ứng dụng"}'
```

### `@cf/google/gemma-4-26b-a4b-it`

**Strengths:** vision, reasoning, 256k context, low listed unit price.  
**Weaknesses:** benchmark Vietnamese OCR on your own screenshots before choosing it.  
**Use:** balanced multimodal assistant, image Q&A and document understanding.

### `@cf/meta/llama-4-scout-17b-16e-instruct`

**Strengths:** native multimodal model, 131k context, function calling.  
**Weaknesses:** Meta terms apply; not an OCR-specialized engine.  
**Use:** visual reasoning, UI understanding and image-assisted agents.

### `@cf/moondream/moondream3.1-9B-A2B`

**Strengths:** fast, efficient, OCR, pointing and detection.  
**Weaknesses:** measured only 2/6 expected anchors on the dense Vietnamese DHG screenshot and produced repetition loops.  
**Use:** sparse text, quick captions and pointing. Do not make it the default for dense Vietnamese desktop screens.

### `@cf/meta/llama-3.2-11b-vision-instruct`

**Strengths:** general recognition, captioning and visual Q&A.  
**Weaknesses:** requires one-time Meta license acceptance.  
**Use:** general image reasoning after license setup.

## Benchmark mode

Text, code, chat and raw-run endpoints accept up to five models and five runs:

```bash
curl -s "$BASE/v1/text" -H 'content-type: application/json' \
  -d '{"prompt":"Giải thích edge caching trong 4 câu","benchmark":{"models":["@cf/zai-org/glm-4.7-flash","@cf/meta/llama-3.3-70b-instruct-fp8-fast"],"runs":3}}'
```

The response reports each run, errors, usage, preview, average, minimum and maximum latency. Benchmark quality separately; speed alone is a dumb model-selection metric.

## Official sources

- https://developers.cloudflare.com/workers-ai/models/
- https://developers.cloudflare.com/workers-ai/changelog/
- https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/
- https://developers.cloudflare.com/workers-ai/features/json-mode/
