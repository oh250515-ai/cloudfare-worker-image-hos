const mode = process.argv[2];
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const scriptName = process.env.WORKER_SCRIPT_NAME;
if (!accountId) throw new Error("CLOUDFLARE_ACCOUNT_ID is missing");

const headers = { "content-type": "application/json" };
if (process.env.CLOUDFLARE_API_TOKEN) headers.authorization = `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`;
else if (process.env.CLOUDFLARE_API_KEY && process.env.CLOUDFLARE_EMAIL) {
  headers["x-auth-key"] = process.env.CLOUDFLARE_API_KEY;
  headers["x-auth-email"] = process.env.CLOUDFLARE_EMAIL;
} else throw new Error("Cloudflare authentication environment is missing");

async function call(url, method, body, allowedCodes = []) {
  const response = await fetch(url, { method, headers, body: JSON.stringify(body) });
  let payload;
  try { payload = await response.json(); } catch { payload = {}; }
  const errors = Array.isArray(payload.errors) ? payload.errors : [];
  const allowed = errors.some(error => allowedCodes.includes(Number(error.code)));
  if ((!response.ok || payload.success === false) && !allowed) {
    const summary = errors.map(error => `${error.code ?? "unknown"}: ${error.message ?? "Cloudflare API error"}`).join("; ") || `HTTP ${response.status}`;
    throw new Error(summary);
  }
  return payload;
}

if (mode === "account") {
  const subdomain = (process.env.WORKERS_SUBDOMAIN || "").trim();
  if (!subdomain) { console.log("workersSubdomain not supplied, skipping account subdomain creation"); process.exit(0); }
  await call(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/workers/subdomain`, "PUT", { subdomain }, [10036]);
  console.log("Account workers.dev subdomain is ready");
} else if (mode === "script") {
  if (!scriptName) throw new Error("Worker script name is missing from Wrangler config");
  await call(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/workers/scripts/${encodeURIComponent(scriptName)}/subdomain`, "POST", { enabled: true, previews_enabled: false });
  console.log("Worker workers.dev route is enabled");
} else throw new Error("Usage: node scripts/cloudflare-subdomain.mjs account|script");
