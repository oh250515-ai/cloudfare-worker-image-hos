import fs from "node:fs";

const workerUrl = (process.env.WORKER_URL || "").replace(/\/$/, "");
const imageUrl = process.env.TEST_IMAGE_URL;
const apiKey = process.env.WORKER_API_KEY || "";
const SAFE_TEXT_IMAGE_URL = "https://placehold.co/900x240/png?text=Image%20HOS%20Smoke%20Test%20OK";
function safeMessage(value) { return String(value || "unknown").replace(/[\r\n\t%]+/g, " ").slice(0, 500); }
function fail(message) { const safe = safeMessage(message); console.error(`::error title=Smoke test failed::${safe}`); throw new Error(safe); }
if (!workerUrl) fail("WORKER_URL is missing");
async function readJson(response, label) { let body; try { body = await response.json(); } catch { fail(`${label} returned non-JSON HTTP ${response.status}`); } if (!response.ok) fail(`${label} returned HTTP ${response.status}, code=${body?.error?.code || "unknown"}, message=${body?.error?.message || "unknown"}, requestId=${body?.requestId || "unknown"}`); return body; }
async function extract(overrides, label) {
  const request = JSON.parse(fs.readFileSync("examples/winform.json", "utf8"));
  delete request.imageUrl; delete request.imageBase64; delete request.imageMimeType;
  Object.assign(request, overrides, { prompt: "Smoke test: describe the image and preserve every visible character in rawText. Return structured JSON without guessing.", parameters: { max_tokens: 4096, temperature: 0.2 }, metadata: { source: label } });
  const headers = { "content-type": "application/json" }; if (apiKey) headers["x-api-key"] = apiKey;
  return readJson(await fetch(`${workerUrl}/v1/extract`, { method: "POST", headers, body: JSON.stringify(request) }), label);
}
async function readableBase64Probe() { const response = await fetch(SAFE_TEXT_IMAGE_URL); if (!response.ok) fail(`Could not download safe smoke image, HTTP ${response.status}`); return { imageBase64: Buffer.from(await response.arrayBuffer()).toString("base64"), imageMimeType: response.headers.get("content-type")?.split(";")[0] || "image/png" }; }
try {
  const health = await readJson(await fetch(`${workerUrl}/health`), "Health check");
  console.log("=== HEALTH RESPONSE ==="); console.log(JSON.stringify(health, null, 2));
  if (health.ok !== true) fail("Health check did not return ok:true");
  let extraction;
  if (imageUrl) { try { extraction = await extract({ imageUrl }, "URL extraction smoke test"); } catch (error) { console.warn(`::warning title=Configured test image failed::${safeMessage(error instanceof Error ? error.message : error)}; retrying with readable base64 probe`); } }
  if (!extraction) extraction = await extract(await readableBase64Probe(), "Base64 extraction smoke test");
  console.log("=== FULL EXTRACTION RESPONSE ==="); console.log(JSON.stringify(extraction, null, 2));
  console.log("=== RAW TEXT ==="); console.log(extraction.result?.rawText ?? "<null>");
  if (extraction.ok !== true) fail(`Extraction returned ok:false, requestId=${extraction.requestId || "unknown"}`);
  if (typeof extraction.result?.rawText !== "string" || !extraction.result.rawText.trim()) fail(`Extraction rawText is empty, adapter=${extraction.adapter || "unknown"}, imageSource=${extraction.imageSource || "unknown"}, requestId=${extraction.requestId || "unknown"}`);
  if (extraction.modelMeta?.finishReason === "length") fail(`Model output was truncated, requestId=${extraction.requestId || "unknown"}`);
  console.log("Smoke test passed with complete response shown above.");
} catch (error) { console.error(`::error title=Smoke test failed::${safeMessage(error instanceof Error ? error.message : error)}`); process.exit(1); }
