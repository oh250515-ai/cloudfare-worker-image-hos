import fs from "node:fs";
const workerUrl = (process.env.WORKER_URL || "").replace(/\/$/, ""), imageUrl = process.env.TEST_IMAGE_URL, apiKey = process.env.WORKER_API_KEY || "";
const REGRESSION_IMAGE_URL = "https://i.vgy.me/6HxY5i.png";
function safeMessage(value) { return String(value || "unknown").replace(/[\r\n\t%]+/g, " ").slice(0, 500); }
function fail(message) { const safe = safeMessage(message); console.error(`::error title=Smoke test failed::${safe}`); throw new Error(safe); }
async function readJson(response, label) { let body; try { body = await response.json(); } catch { fail(`${label} returned non-JSON HTTP ${response.status}`); } if (!response.ok) fail(`${label} HTTP ${response.status}: ${body?.error?.message || "unknown"}`); return body; }
async function extract(url, label, schema = { type: "object", properties: { appName: { type: ["string", "null"] }, loginUser: { type: ["string", "null"] }, errorMessage: { type: ["string", "null"] } } }) { const body = { imageUrl: url, prompt: "Dùng OCR trích toàn bộ thông tin trên hình", model: "@cf/moondream/moondream3.1-9B-A2B", parameters: { max_tokens: 4096, temperature: 0.2 }, output: { includeRawText: true, includeAnnotations: true, schema }, metadata: { source: label } }; const headers = { "content-type": "application/json" }; if (apiKey) headers["x-api-key"] = apiKey; return readJson(await fetch(`${workerUrl}/v1/extract`, { method: "POST", headers, body: JSON.stringify(body) }), label); }
try {
  const health = await readJson(await fetch(`${workerUrl}/health`), "Health"); console.log("=== HEALTH ===\n" + JSON.stringify(health, null, 2));
  const targets = [{ url: REGRESSION_IMAGE_URL, label: "DHG Hospital Reports regression" }]; if (imageUrl && imageUrl !== REGRESSION_IMAGE_URL) targets.push({ url: imageUrl, label: "Configured smoke image" });
  for (const target of targets) { const response = await extract(target.url, target.label); console.log(`=== FULL RESPONSE: ${target.label} ===\n${JSON.stringify(response, null, 2)}`); console.log(`=== RAW TEXT: ${target.label} ===\n${response.result?.rawText ?? "<null>"}`); if (response.ok !== true) fail(`${target.label}: ok is not true`); if (!response.result?.rawText?.trim()) fail(`${target.label}: rawText is empty`); if (response.modelMeta?.ocr?.finishReason === "length") fail(`${target.label}: OCR was truncated`); }
  console.log("All smoke and regression tests passed.");
} catch (error) { console.error(`::error title=Smoke test failed::${safeMessage(error instanceof Error ? error.message : error)}`); process.exit(1); }
