# Deployment setup

The full deployment uses exactly one GitHub Actions secret named `CLOUDFLARE_CONFIG_JSON`. It carries deployment credentials, optional Worker runtime configuration, workers.dev setup, and smoke-test input.

## Complete JSON shape

Global credential mode, matching the existing setup:

```json
{"accountId":"...","email":"cloudflare-login@example.com","apiGlobalToken":"...","apiKey":"...","allowedModels":"@cf/moondream/moondream3.1-9B-A2B","defaultModel":"@cf/moondream/moondream3.1-9B-A2B","maxImageBytes":"8388608","fetchTimeoutMs":"12000","testImageUrl":"https://public.example/test.png","workersSubdomain":"my-account-subdomain"}
```

Scoped token mode, optional and recommended for least privilege:

```json
{"accountId":"...","apiToken":"...","apiKey":"...","allowedModels":"@cf/moondream/moondream3.1-9B-A2B","defaultModel":"@cf/moondream/moondream3.1-9B-A2B","maxImageBytes":"8388608","fetchTimeoutMs":"12000","testImageUrl":"https://public.example/test.png","workersSubdomain":"my-account-subdomain"}
```

`apiGlobalToken` is the canonical field for the Cloudflare Global API Key. For backward compatibility, the parser also accepts `globalApiKey`, `apiGlobalKey`, and lowercase `apiglobaltoken`. Do not rename your current secret if it already uses `apiGlobalToken`.

## Field reference

| Field | Required | Purpose |
| --- | --- | --- |
| `accountId` | Yes | Target Cloudflare account |
| `email` + `apiGlobalToken` | One auth mode | Global API Key authentication used by the current setup |
| `apiToken` | Other auth mode | Scoped deploy token |
| `apiKey` | No | Runtime API key stored as Worker secret `API_KEY` |
| `allowedModels` | No | Comma-separated `ALLOWED_MODELS` runtime variable |
| `defaultModel` | No | `DEFAULT_MODEL` runtime variable |
| `maxImageBytes` | No | `MAX_IMAGE_BYTES`; committed default remains 8 MiB |
| `fetchTimeoutMs` | No | `FETCH_TIMEOUT_MS`; committed default remains 12 seconds |
| `testImageUrl` | No | Public HTTPS image used after deployment |
| `workersSubdomain` | No | Creates the account workers.dev subdomain when one does not exist |

Missing optional fields are skipped. Omitting `apiKey` does not delete an existing Worker secret. Runtime non-secret values are merged into a temporary `wrangler.ci.jsonc`, never committed. Secret values are masked in Actions logs.

## Get credentials

1. **Account ID:** https://dash.cloudflare.com/ → Account home → account row menu → Copy account ID.
2. **Email:** My Profile, use the exact Cloudflare user email owning `apiGlobalToken`.
3. **apiGlobalToken:** https://dash.cloudflare.com/profile/api-tokens → API Keys → View next to Global API Key. Despite the JSON field name, this value is the Cloudflare Global API Key.
4. **Scoped apiToken:** same page → Create Token → custom token. Grant Workers Scripts Edit and the required Workers AI account permission.
5. **Runtime apiKey:** generate your own strong random client key, for example `openssl rand -hex 32`. This is not a Cloudflare credential.
6. **workersSubdomain:** choose the account prefix only, such as `my-team`, not `my-team.workers.dev`. Leave blank if the account already has one.
7. **testImageUrl:** public HTTPS image with clear text and no confidential data. If omitted, CI uses a safe generated test image.

Never commit or paste credentials into issues, logs, screenshots, ClickUp Docs, or chat.

## Add the one GitHub secret

1. Open https://github.com/oh250515-ai/cloudfare-worker-image-hos/settings/secrets/actions.
2. Select **New repository secret**.
3. Name it exactly `CLOUDFLARE_CONFIG_JSON`.
4. Paste strict one-line JSON with straight double quotes, no comments, Markdown fence, variable prefix, or trailing comma.
5. Save, then open Actions → **Test, deploy Worker and publish docs** → **Run workflow**.

Base64-encoded JSON is also accepted if a password manager corrupts punctuation.

## Automated deployment sequence

1. Parse and mask the one JSON secret.
2. Build temporary runtime config and run `npm run check` in the test job.
3. Verify Cloudflare authentication.
4. If `workersSubdomain` exists, create the account subdomain; error 10036 is accepted as already configured.
5. Deploy with Wrangler and capture the printed workers.dev URL.
6. Enable the script workers.dev route.
7. Store `apiKey` through `wrangler secret put API_KEY` when supplied.
8. Smoke test `/health` and `/v1/extract`. CI fails on invalid HTTP/JSON, `ok != true`, or empty `result.rawText`; logs show only ok, model, and request ID.

## Verify and troubleshoot

GitHub Pages is documentation only: https://oh250515-ai.github.io/cloudfare-worker-image-hos/. The extraction API is the workers.dev URL captured by the deploy job.

- Invalid JSON: rebuild from the one-line samples.
- Missing auth: provide `accountId`, `email`, and `apiGlobalToken`, or provide `accountId` and `apiToken`.
- Authentication failure: wrong owner email, rotated Global Key/token, or mismatched account ID.
- Authorization failure: add Workers Scripts/Workers AI permissions.
- Account subdomain failure: selected prefix is unavailable or credential cannot edit Workers.
- URL capture failure: inspect Wrangler output; CI intentionally fails rather than claiming success.
- Smoke failure: confirm the image is public, returns `image/*`, contains readable text, and the model supports image input.
