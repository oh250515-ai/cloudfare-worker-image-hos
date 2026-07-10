import fs from "node:fs";
const workerUrl = (process.env.WORKER_URL || "").replace(/\/$/, ""), imageUrl = process.env.TEST_IMAGE_URL, apiKey = process.env.WORKER_API_KEY || "";
const REGRESSION_IMAGE_URL = "https://i.vgy.me/6HxY5i.png";
const EXPECTED_DHG_ANCHORS = ["DHG.Hospital Reports", "30/06/2026", "06/2026", "admin admin", "3.26.0619.0", "XML130"];
function safeMessage(value) { return String(value || "unknown").replace(/[\r\n\t%]+/g, " ").slice(0, 500); }
function fail(message) { const safe = safeMessage(message); console.error(`::error title=Smoke test failed::${safe}`); throw new Error(safe); }
function comparable(value) { return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("vi").replace(/\s+/g, " "); }
function headers() { const h = { "content-type": "application/json" }; if (apiKey) h["x-api-key"] = apiKey; return h; }
async function readJson(response, label) { let body; try { body = await response.json(); } catch { fail(`${label} returned non-JSON HTTP ${response.status}`); } if (!response.ok) fail(`${label} HTTP ${response.status}: ${body?.error?.message || "unknown"}`); return body; }
async function post(path, body, label) { return readJson(await fetch(`${workerUrl}${path}`, { method: "POST", headers: headers(), body: JSON.stringify(body) }), label); }
async function extract(url, label, model, schema = { type: "object", properties: { appName: { type: ["string", "null"] }, loginUser: { type: ["string", "null"] }, errorMessage: { type: ["string", "null"] } } }) { return post("/v1/extract", { imageUrl: url, prompt: "Dùng OCR trích toàn bộ thông tin trên hình", model, parameters: { max_tokens: 4096, temperature: 0.2 }, output: { includeRawText: true, includeAnnotations: true, schema }, metadata: { source: label } }, label); }
function compareDhg(rawText) { const actual = comparable(rawText); const comparison = EXPECTED_DHG_ANCHORS.map(expected => ({ expected, found: actual.includes(comparable(expected)) })); const found = comparison.filter(item => item.found).length; console.log("=== OCR BASELINE COMPARISON ===\n" + JSON.stringify({ expectedAnchors: EXPECTED_DHG_ANCHORS.length, found, comparison }, null, 2)); if (found < 4) fail(`DHG OCR quality below threshold: found ${found}/${EXPECTED_DHG_ANCHORS.length}; expected at least 4`); }
try {
  const health = await readJson(await fetch(`${workerUrl}/health`), "Health");
  const models = await readJson(await fetch(`${workerUrl}/v1/models`), "Models");
  console.log("=== HEALTH ===\n" + JSON.stringify(health, null, 2)); console.log("=== MODEL POLICY ===\n" + JSON.stringify(models, null, 2));
  const wildcard = models.allowed === "any valid @cf model" || (Array.isArray(models.allowed) && models.allowed.includes("*"));

  const targets = [{ url: REGRESSION_IMAGE_URL, label: "DHG Hospital Reports regression", compare: compareDhg }]; if (imageUrl && imageUrl !== REGRESSION_IMAGE_URL) targets.push({ url: imageUrl, label: "Configured smoke image" });
  for (const target of targets) { const response = await extract(target.url, target.label, models.default); console.log(`=== EXTRACT: ${target.label} ===\n${JSON.stringify(response, null, 2)}`); if (response.ok !== true) fail(`${target.label}: ok is not true`); if (!response.result?.rawText?.trim()) fail(`${target.label}: rawText is empty`); if (target.compare) target.compare(response.result.rawText); }

  if (wildcard) {
    const text = await post("/v1/text", { prompt: "Reply with exactly the word: OK", parameters: { max_tokens: 16, temperature: 0 } }, "Text generation");
    console.log(`=== /v1/text ===\n${JSON.stringify(text, null, 2)}`);
    if (text.ok !== true || !text.text?.trim()) fail("/v1/text returned empty text");
    const bench = await post("/v1/text", { prompt: "Say hello.", parameters: { max_tokens: 16, temperature: 0 }, benchmark: { runs: 1 } }, "Benchmark");
    console.log(`=== /v1/text benchmark ===\n${JSON.stringify(bench, null, 2)}`);
    if (bench.ok !== true || bench.mode !== "benchmark") fail("benchmark mode did not return results");
  } else {
    console.log("Skipping /v1/text and benchmark checks: ALLOWED_MODELS is restricted and does not include a wildcard. Set allowedModels to \"*\" to exercise text/code/chat models.");
  }
  console.log("All smoke, regression and OCR quality checks passed.");
} catch (error) { console.error(`::error title=Smoke test failed::${safeMessage(error instanceof Error ? error.message : error)}`); process.exit(1); }
