# API guide

`POST /v1/extract` accepts `imageUrl`, `imageBase64`, or both. Base64 is preferred; invalid base64 falls back to URL. Add `x-api-key` when configured.

## Moondream behavior

Moondream now runs two independent passes. Pass 1 performs schema-free OCR and produces `rawText`. Pass 2 extracts only compact `data` and annotations. This prevents an unrelated schema from forcing document text into fields such as `loginUser`, which previously caused repetition loops. Unknown or unrelated fields become null.

Recommended request:

```json
{"imageUrl":"https://i.vgy.me/6HxY5i.png","prompt":"Dùng OCR trích toàn bộ thông tin trên hình","model":"@cf/moondream/moondream3.1-9B-A2B","parameters":{"max_tokens":4096,"temperature":0.2},"output":{"includeRawText":true,"includeAnnotations":true,"schema":{"type":"object","properties":{"appName":{"type":["string","null"]},"loginUser":{"type":["string","null"]},"errorMessage":{"type":["string","null"]}}}}}
```

For dense Vietnamese screenshots use `max_tokens` 4096 or more and temperature 0.1-0.2. A schema must match the image. For generic OCR, omit `output.schema`; `rawText` still returns independently.

## Response

The stable response contains `result.rawText`, `result.data`, `result.annotations`, `warnings`, and per-pass `modelMeta`. `adapter: moondream-two-pass` confirms the separated pipeline.

## Other adapters

`auto` selects Moondream two-pass, chat-vision for known multimodal instruction models, or byte/prompt for classic image-to-text models. Explicit values: `moondream`, `chat-vision`, `image-prompt`.
