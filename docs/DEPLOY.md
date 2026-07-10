# Deployment setup

The deployment uses one GitHub Actions secret named `CLOUDFLARE_CONFIG_JSON` for credentials, runtime configuration, workers.dev setup and smoke tests.

## Model policy

`allowedModels` supports exact IDs, comma-separated IDs, glob rules, or `*`:

```json
{"allowedModels":"*","defaultModel":"@cf/mistralai/mistral-small-3.1-24b-instruct"}
```

`*` means any syntactically valid Cloudflare-hosted `@cf/author/model` ID may be selected by the API. It does not permit arbitrary external provider names. This is convenient for development but broad for a public endpoint; production should prefer exact IDs or rules such as `@cf/mistralai/*,@cf/moondream/*`.

## Complete JSON shape

Global credential mode:

```json
{"accountId":"...","email":"cloudflare-login@example.com","apiGlobalToken":"...","apiKey":"...","allowedModels":"*","defaultModel":"@cf/mistralai/mistral-small-3.1-24b-instruct","maxImageBytes":"8388608","fetchTimeoutMs":"12000","testImageUrl":"https://public.example/test.png","workersSubdomain":"my-account-subdomain"}
```

Scoped-token mode replaces `email` and `apiGlobalToken` with `apiToken`. `apiGlobalToken` remains compatible with aliases `globalApiKey`, `apiGlobalKey`, and `apiglobaltoken`.

## OCR behavior

Moondream OCR uses short targeted probes capped at 256 tokens, honors `temperature: 0`, detects repeated word sequences of 1-8 words, trims loops, and retries a failed/repeating probe once with a shorter prompt and 192-token limit. This catches loops such as `để tốt lớp` that character windows missed.

Moondream still hallucinates on dense Vietnamese WinForms screenshots. The regression quality gate uses real image `6HxY5i.png` and requires at least 4 of 6 anchors. Use Mistral Small 3.1 Vision or another stronger vision model as `defaultModel` if Moondream remains below the gate.

## Other runtime fields

`apiKey` is stored as Worker secret `API_KEY`. Optional `maxImageBytes`, `fetchTimeoutMs`, `testImageUrl`, and `workersSubdomain` retain their existing meanings. Missing optional fields are skipped. Non-secret values are written only to temporary CI configuration.

Add the single secret at https://github.com/oh250515-ai/cloudfare-worker-image-hos/settings/secrets/actions, then run **Test, deploy Worker and publish docs**. Full responses, raw OCR text and anchor comparison are printed by the smoke test.
