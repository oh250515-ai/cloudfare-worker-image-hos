import fs from "node:fs";

const workerUrl = (process.env.WORKER_URL || "").replace(/\/$/, "");
const imageUrl = process.env.TEST_IMAGE_URL;
const apiKey = process.env.WORKER_API_KEY || "";
const SAFE_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nGQAAAAASUVORK5CYII=";

function safeMessage(value) { return String(value || "unknown").replace(/[\r\n\t%]+/g, " ").slice(0, 500); }
function fail(message) { const safe = safeMessage(message); console.error(`::error title=Smoke test failed::${safe}`); throw new Error(safe); }
if (!workerUrl) fail("WORKER_URL is missing");

async function readJson(response, label) {
  let body;
  try { body = await response.json(); }
  catch { fail(`${label} returned non-JSON HTTP ${response.status}`); }
  if (!response.ok) fail(`${label} returned HTTP ${response.status}, code=${body?.error?.code || "unknown"}, message=${body?.error?.message || "unknown"}, requestId=${body?.requestId || "unknown"}`);
  return body;
}

async function extract(overrides, label) {
  const request = JSON.parse(fs.readFileSync("examples/winform.json", "utf8"));
  delete request.imageUrl; delete request.imageBase64; delete request.imageMimeType;
  Object.assign(request, overrides, {
    prompt: "Smoke test: describe the image and preserve any visible text in rawText. Return structured JSON without guessing.",
    parameters: { max_tokens: 512 },
    metadata: { source: label }
  });
  const headers = { "content-type": "application/json" };
  if (apiKey) headers["x-api-key"] = apiKey;
  return readJson(await fetch(`${workerUrl}/v1/extract`, { method: "POST", headers, body: JSON.stringify(request) }), label);
}

try {
  const health = await readJson(await fetch(`${workerUrl}/health`), "Health check");
  if (health.ok !== true) fail("Health check did not return ok:true");

  let extraction;
  if (imageUrl) {
    try { extraction = await extract({ imageUrl }, "URL extraction smoke test"); }
    catch (error) { console.warn(`::warning title=Configured test image failed::${safeMessage(error instanceof Error ? error.message : error)}; retrying with embedded base64 probe`); }
  }
  if (!extraction) extraction = await extract({ imageBase64: SAFE_PNG_BASE64, imageMimeType: "image/png" }, "Base64 extraction smoke test");
  if (extraction.ok !== true) fail(`Extraction returned ok:false, requestId=${extraction.requestId || "unknown"}`);
  if (typeof extraction.result?.rawText !== "string" || !extraction.result.rawText.trim()) fail(`Extraction rawText is empty, adapter=${extraction.adapter || "unknown"}, requestId=${extraction.requestId || "unknown"}`);
  console.log(JSON.stringify({ ok: true, model: extraction.model || null, adapter: extraction.adapter || null, imageSource: extraction.imageSource || null, requestId: extraction.requestId || null }));
} catch (error) {
  if (!(error instanceof Error && error.message.includes("Smoke test failed"))) console.error(`::error title=Smoke test failed::${safeMessage(error instanceof Error ? error.message : error)}`);
  process.exit(1);
}
