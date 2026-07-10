# Implementation plan

## Phase 1: foundation

Create the native TypeScript Worker, AI binding, stable response envelope and runtime configuration. Keep dependencies development-only and avoid frameworks.

## Phase 2: extraction

Implement guarded remote-image fetch, dynamic prompt construction, model/parameter selection, structured response normalization, `rawText`, annotations and schema-driven `data`.

## Phase 3: quality and safety

Add URL/model validation, private-host blocking, byte/time limits, optional API key, CORS, unit tests, request IDs and non-persistent logging policy. Validate against at least 20 screenshots: clear WinForms dialogs, low contrast, red circles, arrows, handwriting, mixed Vietnamese/English, and unreadable images.

## Phase 4: delivery

Publish API/spec/security/Cloudflare docs, GitHub Pages, ClickUp Doc, one-secret GitHub Actions deployment and Cloudflare Worker. Record deployed URLs in README after the first successful run.

## Phase 5: hardening after MVP

Add DNS-level SSRF protection via an allowlist or Cloudflare Images ingestion for hostile public use, rate limiting, Turnstile or API gateway policy, model-specific adapters, evaluation fixtures and cost telemetry. Do not add storage until audit or replay is explicitly required.

## Definition of done

Code and docs are on `main`; tests pass; Pages is visible; Worker is deployed; one real image succeeds; API examples are reproducible; secret format is documented; rollback is possible by rerunning a previous GitHub commit.
