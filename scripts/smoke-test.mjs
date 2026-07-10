import fs from "node:fs";

const workerUrl = (process.env.WORKER_URL || "").replace(/\/$/, "");
const imageUrl = process.env.TEST_IMAGE_URL;
const apiKey = process.env.WORKER_API_KEY || "";
if (!workerUrl) throw new Error("WORKER_URL is missing");
if (!imageUrl) throw new Error("TEST_IMAGE_URL is missing");

async function readJson(response, label) {
  let body;
  try { body = await response.json(); }
  catch { throw new Error(`${label} returned non-JSON HTTP ${response.status}`); }
  if (!response.ok) throw new Error(`${label} returned HTTP ${response.status}, code=${body?.error?.code || "unknown"}`);
  return body;
}

const health = await readJson(await fetch(`${workerUrl}/health`), "Health check");
if (health.ok !== true) throw new Error("Health check did not return ok:true");

const request = JSON.parse(fs.readFileSync("examples/winform.json", "utf8"));
request.imageUrl = imageUrl;
request.prompt = "Smoke test: read every visible character. Return rawText and structured JSON without guessing.";
request.metadata = { source: "github-actions-smoke-test" };
const headers = { "content-type": "application/json" };
if (apiKey) headers["x-api-key"] = apiKey;
const extraction = await readJson(await fetch(`${workerUrl}/v1/extract`, { method: "POST", headers, body: JSON.stringify(request) }), "Extraction smoke test");
if (extraction.ok !== true) throw new Error(`Extraction returned ok:false, requestId=${extraction.requestId || "unknown"}`);
if (typeof extraction.result?.rawText !== "string" || !extraction.result.rawText.trim()) throw new Error(`Extraction rawText is empty, requestId=${extraction.requestId || "unknown"}`);
console.log(JSON.stringify({ ok: true, model: extraction.model || null, requestId: extraction.requestId || null }));
