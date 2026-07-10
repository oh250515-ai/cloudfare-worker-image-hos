# Deployment setup

The workflow uses exactly one GitHub Actions secret named `CLOUDFLARE_CONFIG_JSON`. It supports two authentication modes.

## Option A: Global API Key + email

Use this when those are the credentials already available:

```json
{"accountId":"32-character-account-id","email":"cloudflare-login@example.com","globalApiKey":"your-global-api-key"}
```

This mode maps directly to Wrangler's legacy `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_EMAIL`, and `CLOUDFLARE_API_KEY` environment variables. It does not create another token. Global API Key has broad account access, so Option B is safer for long-term CI.

### Get Account ID from Cloudflare

1. Sign in at https://dash.cloudflare.com/.
2. Open **Account home**.
3. Find the target account, open the menu at the end of its row.
4. Select **Copy account ID**.

Official guide: https://developers.cloudflare.com/fundamentals/account/find-account-and-zone-ids/

### Get the Cloudflare email

Use the exact email of the Cloudflare user that owns the Global API Key. In Cloudflare Dashboard, open the profile menu and **My Profile**. Do not use a billing contact or arbitrary team member email.

### Get Global API Key from Cloudflare

1. Open https://dash.cloudflare.com/profile/api-tokens.
2. Find **API Keys**.
3. Next to **Global API Key**, select **View**.
4. Complete password or identity verification.
5. Copy the value immediately and store it only in GitHub Secrets.

Never paste this key into an issue, workflow file, commit, build log, screenshot, ClickUp Doc, or chat.

## Option B: scoped API Token, recommended

```json
{"accountId":"32-character-account-id","apiToken":"your-scoped-api-token"}
```

1. Open https://dash.cloudflare.com/profile/api-tokens.
2. Select **Create Token**, then **Create Custom Token**.
3. Grant **Account > Workers Scripts > Edit** for the target account.
4. Grant the Workers AI account permission exposed by the dashboard for inference/binding access. Start with Read and only broaden if Cloudflare reports a missing permission.
5. Create the token and copy it once.

Official guide: https://developers.cloudflare.com/fundamentals/api/get-started/create-token/

## Add the single secret on GitHub

1. Open https://github.com/oh250515-ai/cloudfare-worker-image-hos/settings/secrets/actions.
2. Select **New repository secret**.
3. Name: `CLOUDFLARE_CONFIG_JSON`.
4. Value: paste one of the one-line JSON objects above. Use straight ASCII double quotes, no comments, no trailing comma and no outer Markdown fence.
5. Save. Open **Actions**, select **Test, deploy Worker and publish docs**, then **Run workflow**.

If a password manager corrupts JSON punctuation, base64-encode the complete JSON object and save the base64 text as the same secret. The workflow accepts both formats.

## Verify deployment

The `Verify Cloudflare authentication` step confirms credentials without printing them. The `Deploy Worker` step prints a URL like `https://cloudfare-worker-image-hos.<subdomain>.workers.dev`.

```bash
curl https://YOUR-WORKER.workers.dev/health
```

GitHub Pages is documentation only: https://oh250515-ai.github.io/cloudfare-worker-image-hos/. It cannot run the extraction API.

## Common failures

- `Invalid JSON`: recreate the secret from a one-line sample; do not include `CLOUDFLARE_CONFIG_JSON=`.
- `Provide either apiToken...`: field names are case-sensitive.
- Authentication failure in Global mode: email does not own the key, key was rotated, or account ID belongs to another account.
- Authorization failure: the Cloudflare user/token lacks Workers Scripts or Workers AI permission.
- Pages succeeds while Worker fails: expected, the jobs deploy independently after tests.
