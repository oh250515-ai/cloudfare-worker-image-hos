# Deployment setup

The full deployment uses exactly one GitHub Actions secret named `CLOUDFLARE_CONFIG_JSON`. It now carries deployment credentials, optional Worker runtime configuration, workers.dev setup, and smoke-test input.

## Complete JSON shape

Scoped token mode, recommended:

```json
{"accountId":"...","apiToken":"...","apiKey":"...","allowedModels":"@cf/moondream/moondream3.1-9B-A2B","defaultModel":"@cf/moondream/moondream3.1-9B-A2B","maxImageBytes":"8388608","fetchTimeoutMs":"12000","testImageUrl":"https://public.example/test.png","workersSubdomain":"my-account-subdomain"}
```

Global key mode:

```json
{"accountId":"...","email":"cloudflare-login@example.com","globalApiKey":"...","apiKey":"...","allowedModels":"...","defaultModel":"...","maxImageBytes":"8388608","fetchTimeoutMs":"12000","testImageUrl":"https://public.example/test.png","workersSubdomain":"my-account-subdomain"}
```

## Field reference

| Field | Required | Purpose |
| --- | --- | --- |
| `accountId` | Yes | Target Cloudflare account |
| `apiToken` | One auth mode | Scoped deploy token |
| `email` + `globalApiKey` | Other auth mode | Legacy Global Key authentication |
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
2. **Email:** My Profile, use the exact Cloudflare user email owning the Global API Key.
3. **Global API Key:** https://dash.cloudflare.com/profile/api-tokens → API Keys → View Global API Key.
4. **Scoped API Token:** same page → Create Token → custom token. Grant Workers Scripts Edit and the required Workers AI account permission for the target account.
5. **Runtime `apiKey`:** generate your own strong random client key, for example `openssl rand -hex 32`. This is not a Cloudflare credential.
6. **`workersSubdomain`:** choose the account prefix only, for example `my-team`, not `my-team.workers.dev`. It must be globally available. Leave blank when the account already has a subdomain.
7. **`testImageUrl`:** public HTTPS image with clear text and no confidential data. If omitted, CI uses a safe generated placeholder image containing `Image HOS Smoke Test OK`.

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
4. If `workersSubdomain` exists, call `PUT /accounts/{account_id}/workers/subdomain`; error 10036 means it already exists and is accepted.
5. Deploy with Wrangler and capture the printed workers.dev URL.
6. Call `POST /accounts/{account_id}/workers/scripts/{script_name}/subdomain` with `enabled:true` and `previews_enabled:false`.
7. Store `apiKey` through `wrangler secret put API_KEY` when supplied.
8. Smoke test `/health` and `/v1/extract`. The workflow fails if HTTP/JSON is invalid, `ok` is not true, or `result.rawText` is empty. Logs show only `ok`, model, and request ID.

## Verify and troubleshoot

GitHub Pages is documentation only: https://oh250515-ai.github.io/cloudfare-worker-image-hos/. The extraction API is the workers.dev URL captured by the deploy job.

- Invalid JSON: rebuild from the one-line samples.
- Authentication failure: wrong owner email, rotated key/token, or mismatched account ID.
- Authorization failure: add Workers Scripts/Workers AI permissions.
- Account subdomain failure: selected prefix is unavailable or the credential cannot edit Workers.
- URL capture failure: inspect Wrangler output; the script intentionally fails rather than claiming deployment success.
- Smoke failure: confirm the test image is public, returns `image/*`, contains readable text, and the selected model supports image input.
