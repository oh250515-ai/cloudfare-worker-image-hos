# Security

The Worker accepts only HTTPS image URLs, rejects obvious loopback/private IPv4 and local hostnames, revalidates redirects, checks image content type, and enforces configurable byte/time limits. An optional `API_KEY` protects extraction while `/health` remains public.

For a private/internal API, also set `ALLOWED_MODELS` and protect the route with Cloudflare Access or rate limiting. For a hostile public API, hostname string checks are not sufficient against DNS rebinding; add an explicit source-domain allowlist or ingest through a controlled Cloudflare service before launch.

Use a scoped Cloudflare API Token for CI, never Global API Key plus email. Keep `CLOUDFLARE_CONFIG_JSON` only in GitHub Secrets. Do not commit screenshots containing patient, credential, or production data. The Worker does not persist images or results, but Cloudflare/platform logs should still be configured to avoid sensitive payload capture.

Report vulnerabilities privately to the repository owner. Do not open an issue containing secrets or sensitive sample images.
