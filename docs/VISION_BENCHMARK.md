# Vision model benchmark report

Date: 10 July 2026  
Workload: dense Vietnamese WinForms screenshot (`https://i.vgy.me/6HxY5i.png`)  
Success gate used by deployment: HTTP success + non-empty `rawText`. Accuracy is reported separately.

## Ground-truth anchors

The screenshot visibly contains these six high-confidence strings:

1. `DHG.Hospital Reports`
2. `30/06/2026`
3. `06/2026`
4. `admin admin`
5. `3.26.0619.0`
6. `XML130`

## Measured result

| Model | Adapter | Raw text | Exact anchors | Stability | Verdict |
| --- | --- | ---: | ---: | --- | --- |
| `@cf/moondream/moondream3.1-9B-A2B` | targeted OCR probes | Yes | **2/6** | Repetition/hallucination observed; loop filter and retry required | Passes availability smoke test, fails production OCR quality target |

Moondream consistently found date/month values but missed the application title, logged-in user, full version and `XML130`. Increasing output length made repetition worse. Short deterministic probes reduced garbage but did not materially improve exact-anchor recall.

## Candidate matrix

These candidates are documented as vision-capable by Cloudflare, but are not marked as measured until the production allowlist permits them and the same image/gate is executed.

| Model | Expected advantage | Risk / setup | Status |
| --- | --- | --- | --- |
| `@cf/mistralai/mistral-small-3.1-24b-instruct` | 24B vision/text, structured extraction, 128k context | Higher latency than Moondream | **Recommended next benchmark** |
| `@cf/google/gemma-4-26b-a4b-it` | Vision + reasoning, 256k context, low listed unit price | Vietnamese OCR not yet measured | Candidate |
| `@cf/meta/llama-4-scout-17b-16e-instruct` | Native multimodal, 131k, function calling | Meta terms, not OCR-specialized | Candidate |
| `@cf/moonshotai/kimi-k2.7-code` | Vision, 262k, structured output, strong UI/code reasoning | Expensive; code-first model | Candidate for screenshot + source analysis |
| `@cf/meta/llama-3.2-11b-vision-instruct` | General vision recognition and VQA | One-time Meta license acceptance | Candidate |
| `@cf/llava-hf/llava-1.5-7b-hf` | Lightweight image-to-text | Beta, older, weaker OCR | Low priority |

## Reproducible request

```bash
curl -s "$BASE/v1/extract" \
  -H 'content-type: application/json' \
  -H 'x-api-key: YOUR_KEY' \
  -d '{
    "model":"@cf/mistralai/mistral-small-3.1-24b-instruct",
    "adapter":"chat-vision",
    "imageUrl":"https://i.vgy.me/6HxY5i.png",
    "prompt":"OCR toàn bộ text theo thứ tự đọc. Không tóm tắt.",
    "parameters":{"max_tokens":4096,"temperature":0},
    "output":{"includeRawText":true,"includeAnnotations":true}
  }'
```

## Scoring

- **Availability:** response is 2xx, `ok=true`, and `rawText` is non-empty.
- **Anchor recall:** found anchors / 6 after case/diacritic normalization.
- **Stability:** no long repeated word sequence and no `finish_reason=length` corruption.
- **Latency:** measure end-to-end milliseconds, including Worker image fetch.
- **Structured quality:** schema fields are correct or null; unrelated screenshot text is never forced into a field.

## How to complete the comparison

Set the single secret to permit the candidates:

```json
{
  "allowedModels":"*",
  "defaultModel":"@cf/mistralai/mistral-small-3.1-24b-instruct"
}
```

Run the workflow once per default model, record the six-anchor result from the smoke log, then choose the cheapest model that meets the required recall. Do not declare a winner from vendor claims alone.
