import type { ExtractRequest, ExtractionResult } from "./contracts";
import { isModelAllowed, safeEqual, validatePublicImageUrl } from "./security";

interface AiBinding { run(model: string, input: Record<string, unknown>): Promise<unknown> }
interface Env {
  AI: AiBinding;
  API_KEY?: string;
  ALLOWED_MODELS?: string;
  DEFAULT_MODEL?: string;
  MAX_IMAGE_BYTES?: string;
  FETCH_TIMEOUT_MS?: string;
}

const DEFAULT_MODEL = "@cf/moondream/moondream3.1-9B-A2B";
const DEFAULT_PROMPT = "Extract every visible text and meaningful visual fact from this image. Detect handwritten or overlaid notes, red circles, arrows, boxes, highlights, and callouts separately. Never invent unreadable text.";

function json(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return Response.json(body, { status, headers: { "content-type": "application/json; charset=utf-8", ...headers } });
}

function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("origin") || "*";
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,x-api-key,authorization",
    "vary": "Origin"
  };
}

function authorize(request: Request, env: Env): boolean {
  if (!env.API_KEY) return true;
  const supplied = request.headers.get("x-api-key") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  return safeEqual(supplied, env.API_KEY);
}

async function fetchImage(initial: URL, maxBytes: number, timeoutMs: number): Promise<Uint8Array> {
  let url = initial;
  for (let redirect = 0; redirect <= 3; redirect++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try { response = await fetch(url, { redirect: "manual", signal: controller.signal }); }
    finally { clearTimeout(timer); }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location || redirect === 3) throw new Error("Too many or invalid image redirects");
      url = validatePublicImageUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) throw new Error(`Image server returned ${response.status}`);
    const type = response.headers.get("content-type")?.split(";")[0].toLowerCase() || "";
    if (!type.startsWith("image/")) throw new Error("imageUrl did not return an image content type");
    const length = Number(response.headers.get("content-length") || 0);
    if (length > maxBytes) throw new Error(`Image exceeds ${maxBytes} bytes`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length || bytes.length > maxBytes) throw new Error(`Image is empty or exceeds ${maxBytes} bytes`);
    return bytes;
  }
  throw new Error("Unable to fetch image");
}

function buildPrompt(input: ExtractRequest): string {
  const schema = input.output?.schema ? JSON.stringify(input.output.schema) : "any JSON object appropriate to the prompt";
  return `${input.prompt?.trim() || DEFAULT_PROMPT}\n\nReturn ONLY valid JSON with this envelope:\n{\"rawText\": string|null, \"data\": object|array|null, \"annotations\": array, \"confidence\": number|null}\nrawText must contain all visible text in natural reading order. data must follow this caller schema: ${schema}. annotations must isolate visual markup and use normalized bbox [x1,y1,x2,y2] values from 0 to 1. Use null when unknown; do not guess.`;
}

function responseText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  const item = value as Record<string, unknown>;
  for (const key of ["response", "description", "answer", "text", "result"]) {
    if (typeof item[key] === "string") return item[key] as string;
  }
  return JSON.stringify(value);
}

function normalizeAiResponse(value: unknown, includeRawText: boolean, includeAnnotations: boolean): { result: ExtractionResult; warnings: string[] } {
  let parsed: unknown = value;
  const text = responseText(value).trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  if (text) { try { parsed = JSON.parse(text); } catch { /* normalized below */ } }
  const warnings: string[] = [];
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    warnings.push("Model did not return structured JSON");
    return { result: { rawText: includeRawText ? text || null : null, data: text || null, annotations: [] }, warnings };
  }
  const object = parsed as Record<string, unknown>;
  const rawText = typeof object.rawText === "string" ? object.rawText : null;
  if (includeRawText && rawText === null) warnings.push("Model omitted rawText");
  const annotations = Array.isArray(object.annotations) ? object.annotations as ExtractionResult["annotations"] : [];
  return {
    result: {
      rawText: includeRawText ? rawText : null,
      data: "data" in object ? object.data : object,
      annotations: includeAnnotations ? annotations : [],
      confidence: typeof object.confidence === "number" ? object.confidence : null
    }, warnings
  };
}

async function handleExtract(request: Request, env: Env, requestId: string): Promise<Response> {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 65536) return json({ ok: false, requestId, error: { code: "REQUEST_TOO_LARGE", message: "JSON body exceeds 64 KiB" } }, 413);
  let input: ExtractRequest;
  try { input = await request.json<ExtractRequest>(); } catch { return json({ ok: false, requestId, error: { code: "INVALID_JSON", message: "Body must be valid JSON" } }, 400); }
  if (!input?.imageUrl) return json({ ok: false, requestId, error: { code: "INVALID_INPUT", message: "imageUrl is required" } }, 400);
  const model = input.model || env.DEFAULT_MODEL || DEFAULT_MODEL;
  if (!isModelAllowed(model, env.ALLOWED_MODELS)) return json({ ok: false, requestId, error: { code: "MODEL_NOT_ALLOWED", message: "Model is invalid or not allowed" } }, 400);
  try {
    const url = validatePublicImageUrl(input.imageUrl);
    const bytes = await fetchImage(url, Number(env.MAX_IMAGE_BYTES || 8388608), Number(env.FETCH_TIMEOUT_MS || 12000));
    const parameters = { ...(input.parameters || {}) };
    delete parameters.image; delete parameters.prompt;
    const aiResponse = await env.AI.run(model, { ...parameters, image: [...bytes], prompt: buildPrompt(input) });
    const normalized = normalizeAiResponse(aiResponse, input.output?.includeRawText !== false, input.output?.includeAnnotations !== false);
    return json({ ok: true, requestId, model, result: normalized.result, warnings: normalized.warnings, metadata: input.metadata || {} });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown extraction error";
    return json({ ok: false, requestId, error: { code: "EXTRACTION_FAILED", message } }, 422);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestId = crypto.randomUUID();
    const cors = corsHeaders(request);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const url = new URL(request.url);
    if (url.pathname === "/health") return json({ ok: true, service: "cloudfare-worker-image-hos", time: new Date().toISOString() }, 200, cors);
    if (url.pathname === "/v1/models" && request.method === "GET") return json({ default: env.DEFAULT_MODEL || DEFAULT_MODEL, allowed: env.ALLOWED_MODELS?.split(",").map(x => x.trim()).filter(Boolean) || "any valid @cf model" }, 200, cors);
    if (url.pathname === "/v1/extract" && request.method === "POST") {
      if (!authorize(request, env)) return json({ ok: false, requestId, error: { code: "UNAUTHORIZED", message: "Invalid API key" } }, 401, cors);
      const response = await handleExtract(request, env, requestId);
      Object.entries(cors).forEach(([key, value]) => response.headers.set(key, String(value)));
      return response;
    }
    return json({ name: "Image HOS API", version: "1.0.0", endpoints: ["GET /health", "GET /v1/models", "POST /v1/extract"] }, 200, cors);
  }
};

export { buildPrompt, normalizeAiResponse };
