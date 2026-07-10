import type { ExtractRequest, ExtractionResult } from "./contracts";
import { resolveImage } from "./image-source";
import { runVisionModel } from "./model-adapters";
import { isModelAllowed, safeEqual } from "./security";

interface AiBinding { run(model: string, input: Record<string, unknown>): Promise<unknown> }
interface Env { AI: AiBinding; API_KEY?: string; ALLOWED_MODELS?: string; DEFAULT_MODEL?: string; MAX_IMAGE_BYTES?: string; FETCH_TIMEOUT_MS?: string }

const DEFAULT_MODEL = "@cf/moondream/moondream3.1-9B-A2B";
const DEFAULT_PROMPT = "Extract every visible text and meaningful visual fact from this image. Detect handwritten or overlaid notes, red circles, arrows, boxes, highlights, and callouts separately. Never invent unreadable text.";

function json(body: unknown, status = 200, headers: HeadersInit = {}): Response { return Response.json(body, { status, headers: { "content-type": "application/json; charset=utf-8", ...headers } }); }
function corsHeaders(request: Request): HeadersInit { return { "access-control-allow-origin": request.headers.get("origin") || "*", "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-allow-headers": "content-type,x-api-key,authorization", "vary": "Origin" }; }
function authorize(request: Request, env: Env): boolean { if (!env.API_KEY) return true; const supplied = request.headers.get("x-api-key") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || ""; return safeEqual(supplied, env.API_KEY); }

function buildPrompt(input: ExtractRequest): string {
  const schema = input.output?.schema ? JSON.stringify(input.output.schema) : "any JSON object appropriate to the prompt";
  return `${input.prompt?.trim() || DEFAULT_PROMPT}\n\nReturn ONLY valid JSON with this envelope:\n{\"rawText\": string|null, \"data\": object|array|null, \"annotations\": array, \"confidence\": number|null}\nrawText must contain all visible text in natural reading order. data must follow this caller schema: ${schema}. annotations must isolate visual markup and use normalized bbox [x1,y1,x2,y2] values from 0 to 1. Use null when unknown; do not guess.`;
}

function responseText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  const item = value as Record<string, unknown>;
  for (const key of ["response", "description", "answer", "text", "result"]) if (typeof item[key] === "string") return item[key] as string;
  return "";
}

function normalizeAiResponse(value: unknown, includeRawText: boolean, includeAnnotations: boolean): { result: ExtractionResult; warnings: string[] } {
  const raw = responseText(value).trim();
  const text = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let parsed: unknown;
  if (text) {
    try { parsed = JSON.parse(text); }
    catch {
      return { result: { rawText: includeRawText ? text : null, data: text, annotations: [] }, warnings: ["Model returned text instead of structured JSON"] };
    }
  } else parsed = value;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { result: { rawText: includeRawText ? text || null : null, data: parsed ?? null, annotations: [] }, warnings: ["Model did not return structured JSON"] };
  const object = parsed as Record<string, unknown>;
  const rawText = typeof object.rawText === "string" ? object.rawText : null;
  const warnings: string[] = [];
  if (includeRawText && rawText === null) warnings.push("Model omitted rawText");
  return { result: { rawText: includeRawText ? rawText : null, data: "data" in object ? object.data : object, annotations: includeAnnotations && Array.isArray(object.annotations) ? object.annotations as ExtractionResult["annotations"] : [], confidence: typeof object.confidence === "number" ? object.confidence : null }, warnings };
}

async function handleExtract(request: Request, env: Env, requestId: string): Promise<Response> {
  const maxBytes = Number(env.MAX_IMAGE_BYTES || 8388608);
  const maxBody = Math.ceil(maxBytes * 1.5) + 131072;
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > maxBody) return json({ ok: false, requestId, error: { code: "REQUEST_TOO_LARGE", message: `JSON body exceeds ${maxBody} bytes` } }, 413);
  let input: ExtractRequest;
  try { input = await request.json<ExtractRequest>(); } catch { return json({ ok: false, requestId, error: { code: "INVALID_JSON", message: "Body must be valid JSON" } }, 400); }
  if (!input?.imageUrl && !input?.imageBase64) return json({ ok: false, requestId, error: { code: "INVALID_INPUT", message: "Provide imageBase64 or imageUrl" } }, 400);
  const model = input.model || env.DEFAULT_MODEL || DEFAULT_MODEL;
  if (!isModelAllowed(model, env.ALLOWED_MODELS)) return json({ ok: false, requestId, error: { code: "MODEL_NOT_ALLOWED", message: "Model is invalid or not allowed" } }, 400);
  try {
    const image = await resolveImage(input, maxBytes, Number(env.FETCH_TIMEOUT_MS || 12000));
    const inference = await runVisionModel(env.AI, model, input, image, buildPrompt(input));
    const normalized = normalizeAiResponse(inference.value, input.output?.includeRawText !== false, input.output?.includeAnnotations !== false);
    return json({ ok: true, requestId, model, adapter: inference.adapter, imageSource: image.source, result: normalized.result, warnings: [...image.warnings, ...inference.warnings, ...normalized.warnings], metadata: input.metadata || {} });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown extraction error";
    return json({ ok: false, requestId, error: { code: "EXTRACTION_FAILED", message } }, 422);
  }
}

export default { async fetch(request: Request, env: Env): Promise<Response> {
  const requestId = crypto.randomUUID(); const cors = corsHeaders(request); const url = new URL(request.url);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (url.pathname === "/health") return json({ ok: true, service: "cloudfare-worker-image-hos", time: new Date().toISOString() }, 200, cors);
  if (url.pathname === "/v1/models" && request.method === "GET") return json({ default: env.DEFAULT_MODEL || DEFAULT_MODEL, allowed: env.ALLOWED_MODELS?.split(",").map(x => x.trim()).filter(Boolean) || "any valid @cf model", adapters: ["auto", "moondream", "image-prompt", "chat-vision"] }, 200, cors);
  if (url.pathname === "/v1/extract" && request.method === "POST") { if (!authorize(request, env)) return json({ ok: false, requestId, error: { code: "UNAUTHORIZED", message: "Invalid API key" } }, 401, cors); const response = await handleExtract(request, env, requestId); Object.entries(cors).forEach(([key, value]) => response.headers.set(key, String(value))); return response; }
  return json({ name: "Image HOS API", version: "1.1.0", endpoints: ["GET /health", "GET /v1/models", "POST /v1/extract"] }, 200, cors);
} };

export { buildPrompt, normalizeAiResponse };
