# Changelog

All notable changes are documented here. This project follows Semantic Versioning.

## [2.1.0] - 2026-07-10

### Added

- Generic Workers AI endpoints: `POST /v1/text`, `/v1/code`, `/v1/chat`, and `/v1/run`.
- Benchmark mode for text, code, chat and raw model calls.
- Image input by public URL, raw base64, or data URI, with base64-to-URL fallback.
- Model allow policy with exact IDs, comma lists, globs, and `*` for any safe `@cf/author/model` ID.
- Separate default models for image, text and code workloads.
- GitHub Pages playground and practical model catalog.
- Dependabot configuration for npm and GitHub Actions.
- Vision benchmark report and OCR quality anchors.
- Automatic workers.dev account/script setup and post-deploy smoke tests.

### Changed

- Upgraded CI to Node 24.18 LTS, checkout v7, setup-node v6 and current Pages actions.
- Pinned Wrangler 4.110.0, TypeScript 7.0.2, Vitest 4.1.10 and Workers Types v5.
- Smoke test now succeeds when extraction returns non-empty `rawText`; OCR accuracy remains visible as an advisory report.
- Moondream OCR uses targeted short probes, word-level repetition detection and deterministic retry.

### Fixed

- Nested Workers AI envelopes such as `{result:{answer}}` are parsed without leaking usage/metrics into business data.
- Global API Key credentials no longer get mistaken for Bearer API Tokens.
- JSON secret parsing, model-specific adapters, workers.dev route activation and transient Workers AI retries.

### Known limitations

- Moondream reached only 2/6 exact anchors on the dense Vietnamese DHG WinForms screenshot. Use a stronger vision model for production OCR.
- Vision model availability depends on the Cloudflare account, terms acceptance and current model catalog.

## [1.0.0] - 2026-07-10

### Added

- Initial Cloudflare Worker image-to-JSON API, Workers AI binding, API-key protection, CI/CD and documentation site.
