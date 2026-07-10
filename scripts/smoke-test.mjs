const workerUrl = String(process.env.WORKER_URL || "").replace(/\/$/, "");
const configuredImageUrl = String(process.env.TEST_IMAGE_URL || "");
const apiKey = String(process.env.WORKER_API_KEY || "");
const regressionImageUrl = "https://i.vgy.me/6HxY5i.png";
const expectedAnchors = [
  "DHG.Hospital Reports",
  "30/06/2026",
  "06/2026",
  "admin admin",
  "3.26.0619.0",
  "XML130"
];

function safeMessage(value) {
  return String(value || "unknown").replace(/[\r\n\t%]+/g, " ").slice(0, 500);
}

function fail(message) {
  const safe = safeMessage(message);
  console.error(`::error title=Smoke test failed::${safe}`);
  throw new Error(safe);
}

function warn(message) {
  console.error(`::warning title=OCR quality warning::${safeMessage(message)}`);
}

function comparable(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("vi")
    .replace(/\s+/g, " ");
}

function requestHeaders() {
  const result = { "content-type": "application/json" };
  if (apiKey) result["x-api-key"] = apiKey;
  return result;
}

async function readJson(response, label) {
  let value;
  try {
    value = await response.json();
  } catch {
    fail(`${label} returned non-JSON HTTP ${response.status}`);
  }
  if (!response.ok) {
    const message = value && value.error ? value.error.message : "unknown";
    fail(`${label} HTTP ${response.status}: ${message}`);
  }
  return value;
}

async function postJson(path, body, label) {
  const response = await fetch(`${workerUrl}${path}`, {
    method: "POST",
    headers: requestHeaders(),
    body: JSON.stringify(body)
  });
  return readJson(response, label);
}

async function runExtraction(imageUrl, label, model) {
  return postJson("/v1/extract", {
    imageUrl,
    prompt: "Dùng OCR trích toàn bộ thông tin trên hình",
    model,
    parameters: { max_tokens: 4096, temperature: 0.2 },
    output: {
      includeRawText: true,
      includeAnnotations: true,
      schema: {
        type: "object",
        properties: {
          appName: { type: ["string", "null"] },
          loginUser: { type: ["string", "null"] },
          errorMessage: { type: ["string", "null"] }
        }
      }
    },
    metadata: { source: label }
  }, label);
}

function rawTextOf(response) {
  if (!response || !response.result) return "";
  return typeof response.result.rawText === "string" ? response.result.rawText.trim() : "";
}

function reportOcrQuality(rawText) {
  const actual = comparable(rawText);
  const comparison = expectedAnchors.map(function mapAnchor(expected) {
    return { expected, found: actual.includes(comparable(expected)) };
  });
  const found = comparison.filter(function onlyFound(item) { return item.found; }).length;
  console.log("=== OCR BASELINE COMPARISON ===");
  console.log(JSON.stringify({
    expectedAnchors: expectedAnchors.length,
    found,
    passCondition: "rawText is non-empty",
    comparison
  }, null, 2));
  if (found < 4) {
    warn(`DHG OCR quality is ${found}/${expectedAnchors.length} anchors. Smoke remains successful because rawText is non-empty.`);
  }
}

async function main() {
  if (!workerUrl) fail("WORKER_URL is missing");

  const health = await readJson(await fetch(`${workerUrl}/health`), "Health");
  const models = await readJson(await fetch(`${workerUrl}/v1/models`), "Models");
  console.log("=== HEALTH ===");
  console.log(JSON.stringify(health, null, 2));
  console.log("=== MODEL POLICY ===");
  console.log(JSON.stringify(models, null, 2));

  const targets = [
    { url: regressionImageUrl, label: "DHG Hospital Reports regression", compare: true }
  ];
  if (configuredImageUrl && configuredImageUrl !== regressionImageUrl) {
    targets.push({ url: configuredImageUrl, label: "Configured smoke image", compare: false });
  }

  for (const target of targets) {
    const result = await runExtraction(target.url, target.label, models.default);
    const rawText = rawTextOf(result);
    console.log(`=== EXTRACT: ${target.label} ===`);
    console.log(JSON.stringify(result, null, 2));
    console.log(`=== RAW TEXT: ${target.label} ===`);
    console.log(rawText || "<null>");
    if (result.ok !== true) fail(`${target.label}: ok is not true`);
    if (!rawText) fail(`${target.label}: rawText is empty`);
    if (target.compare) reportOcrQuality(rawText);
  }

  console.log("Smoke test passed: health is OK and every extraction returned non-empty rawText.");
}

main().catch(function onFailure(error) {
  console.error(`::error title=Smoke test failed::${safeMessage(error instanceof Error ? error.message : error)}`);
  process.exit(1);
});
