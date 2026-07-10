import fs from "node:fs";

function fail(message) { throw new Error(message); }
function clean(value) { return value == null ? "" : String(value).trim(); }
function envLine(name, value) {
  if (/[\r\n]/.test(value)) fail(`${name} must not contain line breaks`);
  fs.appendFileSync(process.env.GITHUB_ENV, `${name}=${value}\n`);
}
function mask(value) { if (value) console.log(`::add-mask::${value}`); }

let raw = clean(process.env.CONFIG_INPUT);
if (!raw) fail("Missing repository secret CLOUDFLARE_CONFIG_JSON");
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
// Existing config compatibility: apiGlobalToken is canonical; older aliases still work.
const globalApiKey = clean(cfg.apiGlobalToken || cfg.apiGlobalKey || cfg.globalApiKey || cfg.apiglobaltoken);
const email = clean(cfg.email);
if (!accountId) fail("accountId is required");
if (apiToken) {
  if (apiToken.includes("***")) fail("apiToken is masked or incomplete");
  mask(apiToken);
  envLine("CLOUDFLARE_API_TOKEN", apiToken);
  console.log("Cloudflare auth mode: scoped API Token");
} else if (globalApiKey && email) {
  if (globalApiKey.includes("***")) fail("apiGlobalToken is masked or incomplete");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("email is invalid");
  mask(globalApiKey); mask(email);
  envLine("CLOUDFLARE_API_KEY", globalApiKey);
  envLine("CLOUDFLARE_EMAIL", email);
  console.log("Cloudflare auth mode: Global API Key + email (legacy, broad access)");
} else fail("Provide either apiToken, or both apiGlobalToken and email");
envLine("CLOUDFLARE_ACCOUNT_ID", accountId);

const apiKey = clean(cfg.apiKey);
const testImageUrl = clean(cfg.testImageUrl) || "https://placehold.co/1200x400/png?text=Image%20HOS%20Smoke%20Test%20OK";
const workersSubdomain = clean(cfg.workersSubdomain);
if (apiKey) { mask(apiKey); envLine("WORKER_API_KEY", apiKey); envLine("HAS_WORKER_API_KEY", "true"); }
else envLine("HAS_WORKER_API_KEY", "false");
mask(testImageUrl);
envLine("TEST_IMAGE_URL", testImageUrl);
envLine("WORKERS_SUBDOMAIN", workersSubdomain);

const config = JSON.parse(fs.readFileSync("wrangler.jsonc", "utf8"));
config.workers_dev = true;
config.vars ||= {};
const runtime = {
  ALLOWED_MODELS: clean(cfg.allowedModels),
  DEFAULT_MODEL: clean(cfg.defaultModel),
  MAX_IMAGE_BYTES: clean(cfg.maxImageBytes),
  FETCH_TIMEOUT_MS: clean(cfg.fetchTimeoutMs)
};
for (const [key, value] of Object.entries(runtime)) {
  if (value) { mask(value); config.vars[key] = value; }
}
fs.writeFileSync("wrangler.ci.jsonc", `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
envLine("WORKER_SCRIPT_NAME", clean(config.name));
console.log(`Prepared CI config with ${Object.values(runtime).filter(Boolean).length} optional runtime override(s)`);
