# API guide

## POST /v1/extract

Send `content-type: application/json`; add `x-api-key` when runtime `API_KEY` is configured. Supply `imageBase64`, `imageUrl`, or both. Base64 is preferred; if it is invalid and `imageUrl` exists, the Worker automatically falls back to the URL.

### URL input

```json
{"imageUrl":"https://example.com/error.png","prompt":"Extract all text and annotations","model":"@cf/moondream/moondream3.1-9B-A2B","parameters":{"max_tokens":1800},"output":{"includeRawText":true,"includeAnnotations":true,"schema":{"type":"object"}}}
```

### Base64 input with URL fallback

```json
{"imageBase64":"iVBORw0KGgo...","imageMimeType":"image/png","imageUrl":"https://example.com/fallback.png","model":"@cf/moondream/moondream3.1-9B-A2B","adapter":"auto","prompt":"Read everything"}
```

`imageBase64` may also be a complete `data:image/png;base64,...` URI. The decoded image must fit `MAX_IMAGE_BYTES`. The request-body allowance scales from that runtime limit.

## Model adapters

`adapter` defaults to `auto`: Moondream uses its query contract with data URI and automatically retries the documented byte/prompt contract; Mistral Small 3.1 and known vision-instruct models use chat-vision content; image-to-text models such as LLaVA use byte-array plus prompt. For an unknown compatible model, explicitly pass `moondream`, `chat-vision`, or `image-prompt`.

## Response

```json
{"ok":true,"requestId":"uuid","model":"@cf/moondream/moondream3.1-9B-A2B","adapter":"moondream-query","imageSource":"base64","result":{"rawText":"Complete text...","data":{},"annotations":[],"confidence":0.91},"warnings":[]}
```

Plain text from a model is preserved as `rawText` with a warning instead of being discarded. Unknown values remain null.

## Other endpoints and errors

`GET /health` checks uptime. `GET /v1/models` returns policy and supported adapter names. Errors include `INVALID_JSON`, `INVALID_INPUT`, `REQUEST_TOO_LARGE`, `UNAUTHORIZED`, `MODEL_NOT_ALLOWED`, and `EXTRACTION_FAILED`.
