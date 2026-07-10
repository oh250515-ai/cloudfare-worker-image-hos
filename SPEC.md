# Product and technical specification

## Goal

Accept a public image URL and return JSON extracted by a caller-selected Workers AI vision model. No WinForms field is hardcoded. The caller controls `prompt`, `model`, `parameters`, and the desired `output.schema`.

## Stable response envelope

Every successful response contains `ok`, `requestId`, `model`, `result`, `warnings`, and caller `metadata`. `result.rawText` is the complete visible text in reading order; `result.data` follows the caller's dynamic schema; `result.annotations` contains overlaid notes, circles, arrows, boxes, highlights, color and normalized bounding boxes when visible.

## Functional requirements

1. `POST /v1/extract` accepts HTTPS public images.
2. Model IDs must use Cloudflare's `@cf/author/model` format and can optionally be restricted by `ALLOWED_MODELS`.
3. Arbitrary inference parameters are forwarded except `image` and `prompt`, which are owned by the Worker.
4. `rawText` and annotations default to enabled and may be disabled per request.
5. Unknown values are `null`; the prompt explicitly forbids guessing.
6. Errors use a machine-readable code and request ID.
7. Images and model output are not persisted.

## Non-functional requirements

Free-tier compatible, stateless, globally deployed, no database, no queue, no external OCR dependency, 8 MiB image default, 12-second image fetch timeout, 64 KiB request JSON limit, automated typecheck/tests/deployment.

## Acceptance criteria

A clean clone passes `npm run check`; `/health` returns 200; at least one public WinForms screenshot returns non-empty `rawText`; a custom prompt and schema alter `result.data`; invalid/private URLs are rejected; changing `model` changes the invoked model; pushing `main` triggers Worker and Pages jobs.
