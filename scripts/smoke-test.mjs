import fs from "node:fs";

const workerUrl = (process.env.WORKER_URL || "").replace(/\/$/, "");
const imageUrl = process.env.TEST_IMAGE_URL;
const apiKey = process.env.WORKER_API_KEY || "";
const REGRESSION_IMAGE_URL = "https://i.vgy.me/6HxY5i.png";
const EXPECTED_DHG_ANCHORS = ["DHG.Hospital Reports", "30/06/2026", "06/2026", "admin admin", "3.26.0619.0", "XML130"];

function safeMessage(value) { return String(value || "unknown").replace(/[\r\n\t%]+/g, " ").slice(0, 500); }
function fail(message) { const safe = safeMessage(message); console.error(`::error title=Smoke test failed::${safe}`); throw new Error(safe); }
function warn(message) { console.error(`::warning title=OCR quality warning::${safeMessage(message)}`); }
function comparable(value) { return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("vi").replace(/\s+/g, " "); }
function headers() { const value = { "content-type": "application/json" }; if (apiKey) value["x-api-key"] = apiKey; return value; }

async function readJson(response, label) {
  let body;
  try { body = await response.json(); } catch { fail(`${label} returned non-JSON HTTP ${response.status}`); }
  if (!response.ok) fail(`${label} HTTP ${response.status}: ${body?.error?.message || "unknown"}`);
  return body;
}
async function post(path, body, label) { return readJson(await fetch(`${workerUrl}${path}`, { method: "POST", headers: headers(), body: JSON.stringify(body) }), label); }
async function extract(url, label, model) {
  return post("/v1/extract", {
    imageUrl: url,
    prompt: "Dùng OCR trích toàn bộ thông tin trên hình",
    model,
    parameters: { max_tokens: 4096, temperature: 0.2 },
    output: {
      includeRawText: true,
      includeAnnotations: true,
      schema: { type: "object", properties: { appName: { type: ["string", "null"] }, loginUser: { type: ["string", "null"] }, errorMessage: { type: ["string", "null"] } }
    },
    metadata: { source: label }
  }, label);
}
function reportDhgQuality(rawText) {
  const actual = comparable(rawText);
  const comparison = EXPECTED_DHG_ANCHORS.map(expected => ({ expected, found: actual.includes(comparable(expected)) }));
  const found = comparison.filter(item => item.found).length;
  console.log("=== OCR BASELINE COMPARISON ===\n" + JSON.stringify({ expectedAnchors: EXPECTED_DHG_ANCHORS.length, found, passCondition: "rawText is non-empty", comparison }, null, 2));
  if (found < 4) warn(`DHG OCR quality is ${found}/${EXPECTED_DHG_ANCHORS.length} anchors. Smoke remains successful because rawText is non-empty.`);
}

try {
  if (!workerUrl) fail("WORKER_URL is missing");
  const health = await readJson(await fetch(`${workerUrl}/health`), "Health");
  const models = await readJson(await fetch(`${workerUrl}/v1/models`), "Models");
  console.log("=== HEALTH ===\n" + JSON.stringify(health, null, 2));
  console.log("=== MODEL POLICY ===\n" + JSON.stringify(models, null, 2));

  const targets = [{ url: REGRESSION_IMAGE_URL, label: "DHG Hospital Reports regression", compare: reportDhgQuality }];
  if (imageUrl && imageUrl !== REGRESSION_IMAGE_URL) targets.push({ url: imageUrl, label: "Configured smoke image" });

  for (const target of targets) {
    const response = await extract(target.url, target.label, models.default);
    console.log(`=== EXTRACT: ${target.label} ===\n${JSON.stringify(response, null, 2)}`);
    console.log(`=== RAW TEXT: ${target.label} ===\n${response.result?.rawText ?? "<null>"}`);
    if (response.ok !== true) fail(`${target.label}: ok is not true`);
    if (typeof response.result?.rawText !== "string" || !response.result.rawText.trim()) fail(`${target.label}: rawText is empty`);
    if (target.compare) target.compare(response.result.rawText);
  }

  console.log("Smoke test passed: health is OK and every extraction returned non-empty rawText.");
} catch (error) {
  console.error(`::error title=Smoke test failed::${safeMessage(error instanceof Error ? error.message : error)}`);
  process.exit(1);
}
