# Cloudflare Workers AI model catalog

A practical guide to models this Worker can call, grouped by job, with strengths, weaknesses, when to use, and a real request. Model IDs change; confirm the current catalog at https://developers.cloudflare.com/workers-ai/models/ . Set `ALLOWED_MODELS` to `*` (or a glob) to call any of these, and pick per request with the `model` field.

All examples assume `BASE=https://YOUR-WORKER.workers.dev` and JSON content type.

## Text generation and chat

### @cf/meta/llama-3.1-8b-instruct  (default text model)
- Strengths: fast, cheap, low latency, reliable general assistant and summarization.
- Weaknesses: weaker at hard reasoning, long context and niche coding vs larger models.
- Use for: default chat, summaries, classification, quick drafts, high-volume tasks.

```bash
curl -s $BASE/v1/text -H 'content-type: application/json' \
  -d '{"prompt":"Tóm tắt đoạn sau trong 1 câu: ...","parameters":{"max_tokens":120}}'
```

### @cf/meta/llama-3.3-70b-instruct-fp8-fast
- Strengths: much stronger reasoning and instruction following, function calling, fp8 keeps it fast for its size.
- Weaknesses: higher cost and latency than 8B; ~24k context.
- Use for: harder reasoning, agent/tool calling, higher-quality drafting.

```bash
curl -s $BASE/v1/chat -H 'content-type: application/json' \
  -d '{"model":"@cf/meta/llama-3.3-70b-instruct-fp8-fast","messages":[{"role":"user","content":"Lập dàn ý cho bài viết về caching."}]}'
```

### @cf/zai-org/glm-4.7-flash
- Strengths: fast, multilingual (100+ languages), long 131k context, tool calling; strong value.
- Weaknesses: less battle-tested than Llama for English edge cases.
- Use for: multilingual chat (including Vietnamese), long documents, cost-sensitive reasoning.

```bash
curl -s $BASE/v1/text -H 'content-type: application/json' \
  -d '{"model":"@cf/zai-org/glm-4.7-flash","prompt":"Giải thích điện toán biên cho người mới."}'
```

## Code generation

### @cf/qwen/qwen2.5-coder-32b-instruct  (default code model)
- Strengths: purpose-built for code, strong multi-language generation, refactoring and explanation.
- Weaknesses: heavier; overkill for trivial snippets; verify the exact ID is live in your account.
- Use for: writing functions, tests, refactors, bug explanations.

```bash
curl -s $BASE/v1/code -H 'content-type: application/json' \
  -d '{"prompt":"Viết hàm TypeScript debounce(fn, ms) kèm kiểu.","parameters":{"max_tokens":400}}'
```

### @cf/moonshotai/kimi-k2.7-code
- Strengths: frontier-scale, very long 262k context, vision + tool calling + structured output for agentic coding.
- Weaknesses: most expensive here; latency higher; use when the task truly needs it.
- Use for: large-repo reasoning, agent workflows, code + screenshot together.

## Vision and OCR

### @cf/mistralai/mistral-small-3.1-24b-instruct  (recommended for dense OCR)
- Strengths: strong vision + text, 128k context, good at dense documents and structured extraction; use adapter `chat-vision`.
- Weaknesses: larger/slower than tiny OCR models.
- Use for: dense Vietnamese screenshots, invoices, forms, reliable OCR + reasoning.

```bash
curl -s $BASE/v1/extract -H 'content-type: application/json' \
  -d '{"model":"@cf/mistralai/mistral-small-3.1-24b-instruct","imageUrl":"https://.../screen.png","prompt":"OCR toàn bộ"}'
```

### @cf/meta/llama-3.2-11b-vision-instruct
- Strengths: solid general vision reasoning and captioning.
- Weaknesses: needs one-time Meta license acceptance in your account before first use.
- Use for: image Q&A, captioning, general visual reasoning.

### @cf/moondream/moondream3.1-9B-A2B
- Strengths: small and fast, OCR/pointing/detect, cheap for high volume.
- Weaknesses: hallucinates and loops on dense multi-diacritic Vietnamese screens; better for sparse text and simple scenes.
- Use for: quick captions, sparse-text images, object pointing on a budget.

### @cf/llava-hf/llava-1.5-7b-hf
- Strengths: lightweight open VQA/captioning.
- Weaknesses: beta, weaker OCR and instruction following.
- Use for: experiments and simple captioning.

## Choosing quickly

- General/cheap chat: llama-3.1-8b-instruct.
- Best reasoning without huge cost: llama-3.3-70b-instruct-fp8-fast or glm-4.7-flash.
- Multilingual + long docs: glm-4.7-flash.
- Code: qwen2.5-coder-32b-instruct; agentic/huge context: kimi-k2.7-code.
- Dense OCR: mistral-small-3.1-24b-instruct; sparse/cheap OCR: moondream.

Benchmark any shortlist in one call by adding `benchmark: { models: [...], runs: 3 }` to a `/v1/text`, `/v1/code`, `/v1/chat` or `/v1/run` request, or use the [playground](https://oh250515-ai.github.io/cloudfare-worker-image-hos/playground.html).
