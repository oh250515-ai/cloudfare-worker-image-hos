# API guide

## POST /v1/extract

Headers: `content-type: application/json`. If `API_KEY` is set on the Worker, also send `x-api-key` or `Authorization: Bearer ...`.

```json
{
  "imageUrl": "https://example.com/error.png",
  "prompt": "Extract the WinForms error and all marked notes.",
  "model": "@cf/moondream/moondream3.1-9B-A2B",
  "parameters": {"max_tokens": 1800, "temperature": 0},
  "output": {
    "includeRawText": true,
    "includeAnnotations": true,
    "schema": {
      "type": "object",
      "properties": {
        "appName": {"type": ["string", "null"]},
        "loginUser": {"type": ["string", "null"]},
        "errorMessage": {"type": ["string", "null"]}
      }
    }
  },
  "metadata": {"sourceId": "ticket-123"}
}
```

`parameters` are forwarded to Workers AI, so use fields supported by the selected model. The Worker removes attempts to override `image` or `prompt`.

## Response

```json
{
  "ok": true,
  "requestId": "uuid",
  "model": "@cf/moondream/moondream3.1-9B-A2B",
  "result": {
    "rawText": "Complete text...",
    "data": {"appName": "HOS", "loginUser": "admin", "errorMessage": "Connection failed"},
    "annotations": [{"type":"red_circle","text":"Connection failed","color":"red","bbox":[0.4,0.2,0.8,0.5],"confidence":0.93}],
    "confidence": 0.91
  },
  "warnings": [],
  "metadata": {"sourceId":"ticket-123"}
}
```

## Other endpoints

`GET /health` is for uptime checks. `GET /v1/models` returns the default and configured allowlist policy. Unknown routes return service metadata.

## Error codes

`INVALID_JSON`, `INVALID_INPUT`, `REQUEST_TOO_LARGE`, `UNAUTHORIZED`, `MODEL_NOT_ALLOWED`, and `EXTRACTION_FAILED`. Treat 4xx errors as non-retryable except temporary image-host failures wrapped by `EXTRACTION_FAILED`.
