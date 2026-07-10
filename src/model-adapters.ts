import type { ExtractRequest, ModelAdapter } from "./contracts";
import type { ResolvedImage } from "./image-source";
interface AiBinding { run(model: string, input: Record<string, unknown>): Promise<unknown> }
interface AdapterResult { value: unknown; adapter: string; warnings: string[]; modelMeta?: Record<string, unknown> }
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
function parameters(input: ExtractRequest) { const result = { ...(input.parameters || {}) }; for (const key of ["image", "prompt", "question", "task", "messages", "stream", "reasoning"]) delete result[key]; return result; }
function nestedResult(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) return {}; const outer = value as Record<string, unknown>; return outer.result && typeof outer.result === "object" && !Array.isArray(outer.result) ? outer.result as Record<string, unknown> : outer; }
function answer(value: unknown) { if (typeof value === "string") return value.trim(); const result = nestedResult(value); for (const key of ["answer", "response", "text", "caption"]) if (typeof result[key] === "string") return (result[key] as string).trim(); return ""; }
function meta(value: unknown) { if (!value || typeof value !== "object" || Array.isArray(value)) return {}; const outer = value as Record<string, unknown>, result = nestedResult(value), output: Record<string, unknown> = {}; if (typeof result.finish_reason === "string") output.finishReason = result.finish_reason; if (result.metrics && typeof result.metrics === "object") output.metrics = result.metrics; if (outer.usage && typeof outer.usage === "object") output.usage = outer.usage; return output; }
function stripFence(value: string) { return value.replace(/^```(?:json|text)?\s*/i, "").replace(/\s*```$/, "").trim(); }
function parseObject(value: string): Record<string, unknown> | null { try { const parsed = JSON.parse(stripFence(value)); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null; } catch { return null; } }
function repetitionIndex(value: string) { let index = -1; for (const pattern of [/(.)\1{20,}/su, /(.{2,8})\1{10,}/su]) { const match = pattern.exec(value); if (match && (index < 0 || match.index < index)) index = match.index; } return index; }
function cleanOcr(value: string) { const index = repetitionIndex(value); return { text: stripFence(index >= 0 ? value.slice(0, index) : value), repeated: index >= 0 }; }
function transient(error: unknown) { return /\b(8008|internal server error|temporar|timeout|overloaded)\b/i.test(error instanceof Error ? error.message : String(error)); }
async function runWithRetry(ai: AiBinding, model: string, payload: Record<string, unknown>) { let last: unknown; for (let attempt = 0; attempt < 3; attempt++) { try { return await ai.run(model, payload); } catch (error) { last = error; if (!transient(error) || attempt === 2) throw error; await sleep(250 * 2 ** attempt); } } throw last; }
async function queryWithSourceFallback(ai: AiBinding, model: string, image: ResolvedImage, payload: Record<string, unknown>, warnings: string[]) { const sources = image.originalUrl ? [image.originalUrl, image.dataUri] : [image.dataUri]; let last: unknown; for (let i = 0; i < sources.length; i++) { try { const value = await runWithRetry(ai, model, { ...payload, image: sources[i] }); if (i) warnings.push("Model retried downloaded image as data URI"); return value; } catch (error) { last = error; if (i === sources.length - 1) throw error; warnings.push("Public URL inference failed; retrying as data URI"); } } throw last; }
export function selectAdapter(model: string, requested: ModelAdapter = "auto"): Exclude<ModelAdapter, "auto"> { if (requested !== "auto") return requested; if (model.includes("/moondream")) return "moondream"; if (model.includes("mistral-small-3.1") || model.includes("vision-instruct")) return "chat-vision"; return "image-prompt"; }

async function runMoondream(ai: AiBinding, model: string, input: ExtractRequest, image: ResolvedImage): Promise<AdapterResult> {
  const caller = parameters(input), requestedMax = Math.max(1024, Math.min(Number(caller.max_tokens || 4096), 8192)), temperature = Number(caller.temperature ?? 0.2) === 0 ? 0.2 : Number(caller.temperature ?? 0.2); delete caller.max_tokens; delete caller.temperature;
  const warnings: string[] = [];
  const probes = [
    "Read the exact application/window title and every top menu item, left to right.",
    "Read every feature tab/header near the top, especially the selected or red-underlined tab.",
    "Read all visible times, full dates, month/year values and date ranges exactly.",
    "Read all filter labels, checkbox/radio labels and their selected values.",
    "Read all grid tab names, column numbers, column codes and table header text.",
    "Read every action button caption in the lower half of the window.",
    "Read the bottom status bar exactly: working month, logged-in user, copyright/product owner and software version.",
    "Read any red text, red underline, callout, annotation, error or highlighted notice exactly. If none, say NONE."
  ];
  const passResults = await Promise.all(probes.map(async (probe, index) => {
    try {
      const response = await queryWithSourceFallback(ai, model, image, { ...caller, task: "query", question: `OCR exact text only. ${probe} Preserve Vietnamese diacritics. One item per line. No explanation, JSON, summary or repetition.`, max_tokens: Math.min(requestedMax, 640), temperature, top_p: 0.9, stream: false, reasoning: false }, warnings);
      const cleaned = cleanOcr(answer(response)); if (cleaned.repeated) warnings.push(`OCR probe ${index + 1} repetition trimmed`); return { text: cleaned.text, meta: meta(response) };
    } catch (error) { warnings.push(`OCR probe ${index + 1} failed: ${error instanceof Error ? error.message : "unknown error"}`); return { text: "", meta: {} }; }
  }));
  const seen = new Set<string>(), lines: string[] = [];
  for (const pass of passResults) for (const line of pass.text.split(/\r?\n/).map(x => x.trim()).filter(x => x && x.toUpperCase() !== "NONE")) { const key = line.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); if (!seen.has(key)) { seen.add(key); lines.push(line); } }
  const rawText = lines.join("\n"); if (!rawText) throw new Error("All targeted OCR probes returned empty text");

  let data: unknown = null, annotations: unknown[] = [], structureMeta: Record<string, unknown> = {};
  if (input.output?.schema || input.output?.includeAnnotations !== false) {
    const schema = input.output?.schema ? JSON.stringify(input.output.schema) : '{"type":"object"}';
    try { const response = await queryWithSourceFallback(ai, model, image, { ...caller, task: "query", question: `Return ONLY compact JSON {"data":<schema object>,"annotations":[]}. Schema: ${schema}. Unknown or unrelated fields must be null. Do not include OCR text or repeat.`, max_tokens: Math.min(requestedMax, 1024), temperature: Math.max(0.1, temperature), top_p: 0.9, stream: false, reasoning: false }, warnings); structureMeta = meta(response); const cleaned = cleanOcr(answer(response)), structured = parseObject(cleaned.text); if (structured) { data = "data" in structured ? structured.data : structured; annotations = Array.isArray(structured.annotations) ? structured.annotations : []; } else warnings.push("Structured pass invalid; returning OCR with data=null"); if (cleaned.repeated) warnings.push("Structured repetition discarded"); } catch (error) { warnings.push(`Structured pass failed; returning OCR only: ${error instanceof Error ? error.message : "unknown error"}`); }
  }
  return { value: { rawText, data, annotations, confidence: null }, adapter: "moondream-targeted-ocr", warnings, modelMeta: { ocrProbes: passResults.map(x => x.meta), structure: structureMeta } };
}
export async function runVisionModel(ai: AiBinding, model: string, input: ExtractRequest, image: ResolvedImage, prompt: string): Promise<AdapterResult> { const adapter = selectAdapter(model, input.adapter || "auto"), params = parameters(input); if (adapter === "moondream") return runMoondream(ai, model, input, image); if (adapter === "chat-vision") { const value = await runWithRetry(ai, model, { ...params, stream: false, messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: image.dataUri } }] }] }); return { value, adapter: "chat-vision", warnings: [] }; } const value = await runWithRetry(ai, model, { ...params, image: [...image.bytes], prompt }); return { value, adapter: "image-prompt-bytes", warnings: [] }; }
