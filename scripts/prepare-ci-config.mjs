import fs from "node:fs";

function fail(message) { throw new Error(message); }
function clean(value) { return value == null ? "" : String(value).trim(); }
function envLine(name, value) {
  if (/[\r\n]/.test(value)) fail(`${name} must not contain line breaks`);
  fs.appendFileSync(process.env.GITHUB_ENV, `${name}=${value}\n`);
}
function mask(value) { if (value) console.log(`::add-mask::${value}`); }

const config = JSON.parse(fs.readFileSync("wrangler.jsonc", "utf8"));
const fileVars = config.vars && typeof config.vars === "object" ? config.vars : {};

let raw = clean(process.env.CONFIG_INPUT);
if (!raw) fail("Missing repository secret CLOUDFLARE_CONFIG_JSON. GitHub Actions needs deploy credentials; the Deploy to Cloudflare button uses Cloudflare OAuth instead.");
raw = raw.replace(/^CLOUDFLARE_CONFIG_JSON\s*=\s*/, "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

let cfg;
try { cfg = JSON.parse(raw); }
catch (jsonError) {
  try { cfg = JSON.parse(Buffer.from(raw, "base64").toString("utf8")); }
  catch { fail(`Invalid CLOUDFLARE_CONFIG_JSON: ${jsonError.message}. See docs/DEPLOY.md`); }
}
if (!cfg || Array.isArray(cfg) || typeof cfg !== "object") fail("Cloudflare config must be a JSON object");

const accountId = clean(cfg.accountId);
const apiToken = clean(cfg.apiToken);
const globalApiKey = clean(cfg.apiGlobalToken || cfg.apiGlobalKey || cfg.globalApiKey || cfg.apiglobaltoken);
const email = clean(cfg.email);
if (!accountId) fail("accountId is required");
if (globalApiKey && email) {
  if (globalApiKey.includes("***")) fail("apiGlobalToken is masked or incomplete");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("email is invalid");
  if (apiToken && apiToken === globalApiKey) console.log("Ignoring duplicate apiToken because Global Key + email auth is configured");
  else if (apiToken) fail("Ambiguous auth: remove apiToken when using email + apiGlobalToken");
  mask(globalApiKey); mask(email);
  envLine("CLOUDFLARE_API_KEY", globalApiKey);
  envLine("CLOUDFLARE_EMAIL", email);
} else if (apiToken) {
  if (apiToken.includes("***")) fail("apiToken is masked or incomplete");
  mask(apiToken);
  envLine("CLOUDFLARE_API_TOKEN", apiToken);
} else fail("Provide either apiToken, or both apiGlobalToken and email");
envLine("CLOUDFLARE_ACCOUNT_ID", accountId);

// Precedence for non-secret settings: GitHub secret JSON first, wrangler.jsonc vars second.
const publicConfig = {
  ALLOWED_MODELS: clean(cfg.allowedModels) || clean(fileVars.ALLOWED_MODELS),
  DEFAULT_MODEL: clean(cfg.defaultModel) || clean(fileVars.DEFAULT_MODEL),
  DEFAULT_TEXT_MODEL: clean(cfg.textModel || cfg.defaultTextModel) || clean(fileVars.DEFAULT_TEXT_MODEL),
  DEFAULT_CODE_MODEL: clean(cfg.codeModel || cfg.defaultCodeModel) || clean(fileVars.DEFAULT_CODE_MODEL),
  MAX_IMAGE_BYTES: clean(cfg.maxImageBytes) || clean(fileVars.MAX_IMAGE_BYTES),
  FETCH_TIMEOUT_MS: clean(cfg.fetchTimeoutMs) || clean(fileVars.FETCH_TIMEOUT_MS)
};

config.workers_dev = true;
config.vars ||= {};
for (const [key, value] of Object.entries(publicConfig)) if (value) config.vars[key] = value;

const apiKey = clean(cfg.apiKey);
const testImageUrl = clean(cfg.testImageUrl) || clean(fileVars.TEST_IMAGE_URL) || "https://placehold.co/1200x400/png?text=Image%20HOS%20Smoke%20Test%20OK";
const workersSubdomain = clean(cfg.workersSubdomain) || clean(fileVars.WORKERS_SUBDOMAIN);
if (apiKey) { mask(apiKey); envLine("WORKER_API_KEY", apiKey); envLine("HAS_WORKER_API_KEY", "true"); }
else envLine("HAS_WORKER_API_KEY", "false");
mask(testImageUrl);
envLine("TEST_IMAGE_URL", testImageUrl);
envLine("WORKERS_SUBDOMAIN", workersSubdomain);

// CI-only values must not become Worker runtime environment variables.
delete config.vars.TEST_IMAGE_URL;
delete config.vars.WORKERS_SUBDOMAIN;

fs.writeFileSync("wrangler.ci.jsonc", `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
envLine("WORKER_SCRIPT_NAME", clean(config.name));
console.log(`Prepared CI config. GitHub secret overrides wrangler.jsonc public defaults.`);
