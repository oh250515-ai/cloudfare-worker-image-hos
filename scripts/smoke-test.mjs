import fs from "node:fs";
const workerUrl = (process.env.WORKER_URL || "").replace(/\/$/, ""), imageUrl = process.env.TEST_IMAGE_URL, apiKey = process.env.WORKER_API_KEY || "";
const REGRESSION_IMAGE_URL = "https://i.vgy.me/6HxY5i.png";
const EXPECTED_DHG_ANCHORS = ["DHG.Hospital Reports", "30/06/2026", "06/2026", "admin admin", "3.26.0619.0", "XML130"];
function safeMessage(value) { return String(value || "unknown").replace(/[\r\n\t%]+/g, " ").slice(0, 500); }
function fail(message) { const safe = safeMessage(message); console.error(`::error title=Smoke test failed::${safe}`); throw new Error(safe); }
function comparable(value) { return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("vi").replace(/\s+/g, " "); }
async function readJson(response, label) { let body; try { body = await response.json(); } catch { fail(`${label} returned non-JSON HTTP ${response.status}`); } if (!response.ok) fail(`${label} HTTP ${response.status}: ${body?.error?.message || "unknown"}`); return body; }
async function extract(url, label, schema = { type: "object", properties: { appName: { type: ["string", "null"] }, loginUser: { type: ["string", "null"] }, errorMessage: { type: ["string", "null"] } } }) { const body = { imageUrl: url, prompt: "Dùng OCR trích toàn bộ thông tin trên hình", model: "@cf/moondream/moondream3.1-9B-A2B", parameters: { max_tokens: 4096, temperature: 0.2 }, output: { includeRawText: true, includeAnnotations: true, schema }, metadata: { source: label } }; const headers = { "content-type": "application/json" }; if (apiKey) headers["x-api-key"] = apiKey; return readJson(await fetch(`${workerUrl}/v1/extract`, { method: "POST", headers, body: JSON.stringify(body) }), label); }
function compareDhg(rawText) {
  const actual = comparable(rawText);
  const comparison = EXPECTED_DHG_ANCHORS.map(expected => ({ expected, found: actual.includes(comparable(expected)) }));
  const found = comparison.filter(item => item.found).length;
  console.log("=== OCR BASELINE COMPARISON ===\n" + JSON.stringify({ expectedAnchors: EXPECTED_DHG_ANCHORS.length, found, comparison }, null, 2));
  if (found < 4) fail(`DHG OCR quality below threshold: found ${found}/${EXPECTED_DHG_ANCHORS.length} anchors; expected at least 4`);
}
try {
  const health = await readJson(await fetch(`${workerUrl}/health`), "Health"); console.log("=== HEALTH ===\n" + JSON.stringify(health, null, 2));
  const targets = [{ url: REGRESSION_IMAGE_URL, label: "DHG Hospital Reports regression", compare: compareDhg }]; if (imageUrl && imageUrl !== REGRESSION_IMAGE_URL) targets.push({ url: imageUrl, label: "Configured smoke image" });
  for (const target of targets) { const response = await extract(target.url, target.label); console.log(`=== FULL RESPONSE: ${target.label} ===\n${JSON.stringify(response, null, 2)}`); console.log(`=== RAW TEXT: ${target.label} ===\n${response.result?.rawText ?? "<null>"}`); if (response.ok !== true) fail(`${target.label}: ok is not true`); if (!response.result?.rawText?.trim()) fail(`${target.label}: rawText is empty`); if (target.compare) target.compare(response.result.rawText); }
  console.log("All smoke, regression and OCR quality checks passed.");
} catch (error) { console.error(`::error title=Smoke test failed::${safeMessage(error instanceof Error ? error.message : error)}`); process.exit(1); }
