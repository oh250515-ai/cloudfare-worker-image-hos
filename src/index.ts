import type { ExtractRequest, ExtractionResult } from "./contracts";
import { resolveImage } from "./image-source";
import { runVisionModel } from "./model-adapters";
import { benchmarkModels, runModel } from "./run";
import { isModelAllowed, safeEqual } from "./security";
interface AiBinding { run(model: string, input: Record<string, unknown>): Promise<unknown> }
interface Env { AI: AiBinding; API_KEY?: string; ALLOWED_MODELS?: string; DEFAULT_MODEL?: string; DEFAULT_TEXT_MODEL?: string; DEFAULT_CODE_MODEL?: string; MAX_IMAGE_BYTES?: string; FETCH_TIMEOUT_MS?: string }
interface ModelEnvelope { content: unknown; finishReason: string | null; modelMeta: Record<string, unknown> }
type RunKind = "run" | "text" | "code" | "chat";
const DEFAULT_MODEL = "@cf/moondream/moondream3.1-9B-A2B";
const DEFAULT_TEXT_MODEL = "@cf/meta/llama-3.1-8b-instruct";
const DEFAULT_CODE_MODEL = "@cf/qwen/qwen2.5-coder-32b-instruct";
const DEFAULT_PROMPT = "Extract every visible text and meaningful visual fact from this image. Detect handwritten or overlaid notes, red circles, arrows, boxes, highlights, and callouts separately. Never invent unreadable text.";
const clean = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
const json = (body: unknown, status = 200, headers: HeadersInit = {}) => Response.json(body, { status, headers: { "content-type": "application/json; charset=utf-8", ...headers } });
const corsHeaders = (request: Request): HeadersInit => ({ "access-control-allow-origin": request.headers.get("origin") || "*", "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-allow-headers": "content-type,x-api-key,authorization", vary: "Origin" });
function authorize(request: Request, env: Env) { if (!env.API_KEY) return true; const supplied = request.headers.get("x-api-key") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || ""; return safeEqual(supplied, env.API_KEY); }
function buildPrompt(input: ExtractRequest): string { const schema = input.output?.schema ? JSON.stringify(input.output.schema) : "any JSON object appropriate to the image"; return `${input.prompt?.trim() || DEFAULT_PROMPT}\n\nReturn ONLY valid JSON with this envelope:\n{\"rawText\": string|null, \"data\": object|array|null, \"annotations\": array, \"confidence\": number|null}\nrawText must contain all visible text in natural reading order. data must follow this caller schema: ${schema}. If the image is unrelated to a schema field, set that field to null; never force unrelated text into it. Use null when unknown; do not guess or repeat characters.`; }
function unwrapModelEnvelope(value: unknown): ModelEnvelope { if (!value || typeof value !== "object" || Array.isArray(value)) return { content: value, finishReason: null, modelMeta: {} }; const outer = value as Record<string, unknown>; const nested = outer.result && typeof outer.result === "object" && !Array.isArray(outer.result) ? outer.result as Record<string, unknown> : null; const source = nested || outer; let content: unknown = source; for (const key of ["answer", "response", "text", "description", "caption"]) if (typeof source[key] === "string") { content = source[key]; break; } const finishReason = typeof source.finish_reason === "string" ? source.finish_reason : typeof outer.finish_reason === "string" ? outer.finish_reason : null; const modelMeta: Record<string, unknown> = {}; if (finishReason) modelMeta.finishReason = finishReason; if (source.metrics && typeof source.metrics === "object") modelMeta.metrics = source.metrics; if (outer.usage && typeof outer.usage === "object") modelMeta.usage = outer.usage; return { content, finishReason, modelMeta }; }
function stripCodeFence(value: string) { return value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""); }
function repeatedRun(value: string) { return /(.)\1{31,}/su.test(value) || /(.{2,8})\1{15,}/su.test(value); }
function collectText(value: unknown, out: string[], depth = 0): void { if (depth > 8 || value == null) return; if (typeof value === "string") { const text = value.trim(); if (text && !out.includes(text)) out.push(text); return; } if (Array.isArray(value)) { for (const item of value) collectText(item, out, depth + 1); return; } if (typeof value === "object") for (const [key, item] of Object.entries(value as Record<string, unknown>)) if (!/^(bbox|confidence|score|usage|metrics|reasoning|finish_reason)$/i.test(key)) collectText(item, out, depth + 1); }
function recoveredRawText(object: Record<string, unknown>): string | null { for (const key of ["rawText", "raw_text", "allText", "all_text", "ocrText", "ocr_text", "text", "answer", "response", "caption"]) if (typeof object[key] === "string" && (object[key] as string).trim()) return (object[key] as string).trim(); const values: string[] = []; collectText("data" in object ? object.data : object, values); return values.length ? values.join("\n") : null; }
function normalizeAiResponse(value: unknown, includeRawText: boolean, includeAnnotations: boolean): { result: ExtractionResult; warnings: string[]; modelMeta: Record<string, unknown> } { const envelope = unwrapModelEnvelope(value); const warnings: string[] = []; if (envelope.finishReason === "length") warnings.push("Model output was truncated at max_tokens"); let parsed: unknown = envelope.content, generatedText = ""; if (typeof envelope.content === "string") { generatedText = stripCodeFence(envelope.content); if (repeatedRun(generatedText)) warnings.push("Model output contains a repetition loop"); try { parsed = JSON.parse(generatedText); } catch { warnings.push("Model generated invalid JSON; preserving text in rawText"); return { result: { rawText: includeRawText ? generatedText || null : null, data: null, annotations: [] }, warnings, modelMeta: envelope.modelMeta }; } } if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { result: { rawText: includeRawText ? generatedText || null : null, data: parsed ?? null, annotations: [] }, warnings: [...warnings, "Model did not return a JSON object"], modelMeta: envelope.modelMeta }; const object = parsed as Record<string, unknown>, rawText = recoveredRawText(object); if (includeRawText && !rawText) warnings.push("Model omitted rawText"); return { result: { rawText: includeRawText ? rawText : null, data: "data" in object ? object.data : object, annotations: includeAnnotations && Array.isArray(object.annotations) ? object.annotations as ExtractionResult["annotations"] : [], confidence: typeof object.confidence === "number" ? object.confidence : null }, warnings, modelMeta: envelope.modelMeta }; }

async function handleExtract(request: Request, env: Env, requestId: string): Promise<Response> { const maxBytes = Number(env.MAX_IMAGE_BYTES || 8388608), maxBody = Math.ceil(maxBytes * 1.5) + 131072, contentLength = Number(request.headers.get("content-length") || 0); if (contentLength > maxBody) return json({ ok: false, requestId, error: { code: "REQUEST_TOO_LARGE", message: `JSON body exceeds ${maxBody} bytes` } }, 413); let input: ExtractRequest; try { input = await request.json<ExtractRequest>(); } catch { return json({ ok: false, requestId, error: { code: "INVALID_JSON", message: "Body must be valid JSON" } }, 400); } if (!input?.imageUrl && !input?.imageBase64) return json({ ok: false, requestId, error: { code: "INVALID_INPUT", message: "Provide imageBase64 or imageUrl" } }, 400); const model = input.model || env.DEFAULT_MODEL || DEFAULT_MODEL; if (!isModelAllowed(model, env.ALLOWED_MODELS)) return json({ ok: false, requestId, error: { code: "MODEL_NOT_ALLOWED", message: "Model is invalid or not allowed" } }, 400); try { const image = await resolveImage(input, maxBytes, Number(env.FETCH_TIMEOUT_MS || 12000)); const inference = await runVisionModel(env.AI, model, input, image, buildPrompt(input)); const normalized = normalizeAiResponse(inference.value, input.output?.includeRawText !== false, input.output?.includeAnnotations !== false); return json({ ok: true, requestId, model, adapter: inference.adapter, imageSource: image.source, result: normalized.result, warnings: [...image.warnings, ...inference.warnings, ...normalized.warnings], modelMeta: { ...(inference.modelMeta || {}), normalized: normalized.modelMeta }, metadata: input.metadata || {} }); } catch (error) { return json({ ok: false, requestId, error: { code: "EXTRACTION_FAILED", message: error instanceof Error ? error.message : "Unknown extraction error" } }, 422); } }

function resolveRunModel(body: Record<string, unknown>, env: Env, kind: RunKind): string {
  const requested = clean(body.model);
  if (requested) return requested;
  if (kind === "code") return env.DEFAULT_CODE_MODEL || DEFAULT_CODE_MODEL;
  return env.DEFAULT_TEXT_MODEL || DEFAULT_TEXT_MODEL;
}
function buildRunInput(body: Record<string, unknown>, kind: RunKind): Record<string, unknown> | { error: string } {
  if (kind === "run") {
    const base = body.input && typeof body.input === "object" && !Array.isArray(body.input) ? { ...(body.input as Record<string, unknown>) } : { ...((body.parameters as Record<string, unknown>) || {}) };
    if (Array.isArray(body.messages) && !("messages" in base)) base.messages = body.messages;
    if (typeof body.prompt === "string" && !("prompt" in base) && !("messages" in base)) base.prompt = body.prompt;
    if (!("messages" in base) && !("prompt" in base)) return { error: "Provide input with messages or prompt" };
    return base;
  }
  const params = body.parameters && typeof body.parameters === "object" && !Array.isArray(body.parameters) ? { ...(body.parameters as Record<string, unknown>) } : {};
  delete params.messages; delete params.prompt;
  if (Array.isArray(body.messages)) return { messages: body.messages, ...params };
  if (kind === "chat") return { error: "chat requires a messages array" };
  if (typeof body.prompt === "string" && body.prompt.trim()) {
    const system = kind === "code" ? "You are an expert programming assistant. Return correct, runnable code and a brief explanation." : "You are a helpful assistant.";
    return { messages: [{ role: "system", content: system }, { role: "user", content: body.prompt }], ...params };
  }
  return { error: "Provide prompt or messages" };
}
async function handleRun(request: Request, env: Env, requestId: string, kind: RunKind): Promise<Response> {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 262144) return json({ ok: false, requestId, error: { code: "REQUEST_TOO_LARGE", message: "JSON body exceeds 256 KiB" } }, 413);
  let body: Record<string, unknown>;
  try { body = await request.json<Record<string, unknown>>(); } catch { return json({ ok: false, requestId, error: { code: "INVALID_JSON", message: "Body must be valid JSON" } }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ ok: false, requestId, error: { code: "INVALID_INPUT", message: "Body must be a JSON object" } }, 400);
  const model = resolveRunModel(body, env, kind);
  if (!isModelAllowed(model, env.ALLOWED_MODELS)) return json({ ok: false, requestId, error: { code: "MODEL_NOT_ALLOWED", message: "Model is invalid or not allowed" } }, 400);
  const input = buildRunInput(body, kind);
  if ("error" in input) return json({ ok: false, requestId, error: { code: "INVALID_INPUT", message: (input as { error: string }).error } }, 400);
  const bench = body.benchmark;
  if (bench) {
    const spec = typeof bench === "object" && bench ? bench as Record<string, unknown> : {};
    const requested = Array.isArray(spec.models) && spec.models.length ? (spec.models as unknown[]).map(clean).filter(Boolean) : [model];
    const models = requested.slice(0, 5);
    for (const candidate of models) if (!isModelAllowed(candidate, env.ALLOWED_MODELS)) return json({ ok: false, requestId, error: { code: "MODEL_NOT_ALLOWED", message: `Model not allowed: ${candidate}` } }, 400);
    const runs = Math.max(1, Math.min(Number(spec.runs) || 3, 5));
    try { const results = await benchmarkModels(env.AI, models, input as Record<string, unknown>, runs); return json({ ok: true, requestId, mode: "benchmark", kind, benchmark: { models, runs, input, results }, metadata: body.metadata || {} }); }
    catch (error) { return json({ ok: false, requestId, error: { code: "RUN_FAILED", message: error instanceof Error ? error.message : "Unknown run error" } }, 422); }
  }
  try { const result = await runModel(env.AI, model, input as Record<string, unknown>); return json({ ok: true, requestId, kind, model, text: result.text || null, output: result.output, usage: result.usage, timingMs: result.timingMs, metadata: body.metadata || {} }); }
  catch (error) { return json({ ok: false, requestId, error: { code: "RUN_FAILED", message: error instanceof Error ? error.message : "Unknown run error" } }, 422); }
}

const RUN_ROUTES: Record<string, RunKind> = { "/v1/run": "run", "/v1/text": "text", "/v1/code": "code", "/v1/chat": "chat" };

export default { async fetch(request: Request, env: Env): Promise<Response> {
  const requestId = crypto.randomUUID(), cors = corsHeaders(request), url = new URL(request.url);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (url.pathname === "/health") return json({ ok: true, service: "cloudfare-worker-image-hos", time: new Date().toISOString() }, 200, cors);
  if (url.pathname === "/v1/models" && request.method === "GET") return json({ default: env.DEFAULT_MODEL || DEFAULT_MODEL, textDefault: env.DEFAULT_TEXT_MODEL || DEFAULT_TEXT_MODEL, codeDefault: env.DEFAULT_CODE_MODEL || DEFAULT_CODE_MODEL, allowed: env.ALLOWED_MODELS?.split(",").map(x => x.trim()).filter(Boolean) || "any valid @cf model", adapters: ["auto", "moondream", "image-prompt", "chat-vision"] }, 200, cors);
  if (url.pathname === "/v1/extract" && request.method === "POST") { if (!authorize(request, env)) return json({ ok: false, requestId, error: { code: "UNAUTHORIZED", message: "Invalid API key" } }, 401, cors); const response = await handleExtract(request, env, requestId); Object.entries(cors).forEach(([key, value]) => response.headers.set(key, String(value))); return response; }
  if (url.pathname in RUN_ROUTES && request.method === "POST") { if (!authorize(request, env)) return json({ ok: false, requestId, error: { code: "UNAUTHORIZED", message: "Invalid API key" } }, 401, cors); const response = await handleRun(request, env, requestId, RUN_ROUTES[url.pathname]); Object.entries(cors).forEach(([key, value]) => response.headers.set(key, String(value))); return response; }
  return json({ name: "Image HOS API", version: "2.0.0", endpoints: ["GET /health", "GET /v1/models", "POST /v1/extract", "POST /v1/run", "POST /v1/text", "POST /v1/code", "POST /v1/chat"] }, 200, cors);
} };
export { buildPrompt, normalizeAiResponse, unwrapModelEnvelope };
