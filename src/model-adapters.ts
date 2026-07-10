import type { ExtractRequest, ModelAdapter } from "./contracts";
import type { ResolvedImage } from "./image-source";
interface AiBinding { run(model: string, input: Record<string, unknown>): Promise<unknown> }
interface AdapterResult { value: unknown; adapter: string; warnings: string[]; modelMeta?: Record<string, unknown> }
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
function parameters(input: ExtractRequest) { const result = { ...(input.parameters || {}) }; for (const key of ["image", "prompt", "question", "task", "messages", "stream", "reasoning"]) delete result[key]; return result; }
function nestedResult(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) return {}; const outer = value as Record<string, unknown>; return outer.result && typeof outer.result === "object" && !Array.isArray(outer.result) ? outer.result as Record<string, unknown> : outer; }
function answer(value: unknown) { if (typeof value === "string") return value.trim(); const result = nestedResult(value); for (const key of ["answer", "response", "text", "caption"]) if (typeof result[key] === "string") return (result[key] as string).trim(); return ""; }
function meta(value: unknown) { if (!value || typeof value !== "object" || Array.isArray(value)) return {}; const outer = value as Record<string, unknown>, result = nestedResult(value), output: Record<string, unknown> = {}; if (typeof result.finish_reason === "string") output.finishReason = result.finish_reason; if (result.metrics && typeof result.metrics === "object") output.metrics = result.metrics; if (outer.usage && typeof outer.usage === "object") output.usage = outer.usage; return output; }
function stripFence(value: string) { return value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim(); }
function parseObject(value: string): Record<string, unknown> | null { try { const parsed = JSON.parse(stripFence(value)); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null; } catch { return null; } }
function repetitionIndex(value: string): number { const patterns = [/(.)\1{20,}/su, /(.{2,8})\1{10,}/su]; let index = -1; for (const pattern of patterns) { const match = pattern.exec(value); if (match && (index < 0 || match.index < index)) index = match.index; } return index; }
function cleanOcr(value: string): { text: string; repeated: boolean } { const index = repetitionIndex(value); const text = (index >= 0 ? value.slice(0, index) : value).replace(/^```(?:text)?\s*/i, "").replace(/\s*```$/, "").trim(); return { text, repeated: index >= 0 }; }
function transient(error: unknown) { return /\b(8008|internal server error|temporar|timeout|overloaded)\b/i.test(error instanceof Error ? error.message : String(error)); }
async function runWithRetry(ai: AiBinding, model: string, payload: Record<string, unknown>) { let last: unknown; for (let attempt = 0; attempt < 3; attempt++) { try { return await ai.run(model, payload); } catch (error) { last = error; if (!transient(error) || attempt === 2) throw error; await sleep(250 * 2 ** attempt); } } throw last; }
async function queryWithSourceFallback(ai: AiBinding, model: string, image: ResolvedImage, payload: Record<string, unknown>, warnings: string[]) { const sources = image.originalUrl ? [image.originalUrl, image.dataUri] : [image.dataUri]; let last: unknown; for (let i = 0; i < sources.length; i++) { try { const value = await runWithRetry(ai, model, { ...payload, image: sources[i] }); if (i) warnings.push("Model retried downloaded image as data URI"); return value; } catch (error) { last = error; if (i === sources.length - 1) throw error; warnings.push("Public URL inference failed; retrying as data URI"); } } throw last; }
export function selectAdapter(model: string, requested: ModelAdapter = "auto"): Exclude<ModelAdapter, "auto"> { if (requested !== "auto") return requested; if (model.includes("/moondream")) return "moondream"; if (model.includes("mistral-small-3.1") || model.includes("vision-instruct")) return "chat-vision"; return "image-prompt"; }

async function runMoondream(ai: AiBinding, model: string, input: ExtractRequest, image: ResolvedImage): Promise<AdapterResult> {
  const caller = parameters(input), requestedMax = Math.max(1024, Math.min(Number(caller.max_tokens || 4096), 8192)), temperature = Number(caller.temperature ?? 0.2) === 0 ? 0.2 : Number(caller.temperature ?? 0.2); delete caller.max_tokens; delete caller.temperature;
  const warnings: string[] = [];
  const regions = [
    "Transcribe only the TOP area: window title, menu bar, tabs, highlighted/underlined headings, date/time and top filter labels/values.",
    "Transcribe only the MIDDLE area: option labels, checkboxes, table tabs, column headers, search text and visible grid values.",
    "Transcribe only the BOTTOM area: date range controls, action buttons, status bar, working month, logged-in user, copyright and version."
  ];
  const passResults = await Promise.all(regions.map(async (region, index) => {
    try {
      const response = await queryWithSourceFallback(ai, model, image, { ...caller, task: "query", question: `OCR only. ${region} Preserve Vietnamese diacritics. One item per line. Do not summarize, return JSON, or repeat text.`, max_tokens: Math.min(requestedMax, 1200), temperature, top_p: 0.9, stream: false, reasoning: false }, warnings);
      const cleaned = cleanOcr(answer(response));
      if (cleaned.repeated) warnings.push(`OCR segment ${index + 1} repetition was trimmed`);
      if ((meta(response) as Record<string, unknown>).finishReason === "length") warnings.push(`OCR segment ${index + 1} reached token limit; retained non-repeating prefix`);
      return { text: cleaned.text, meta: meta(response) };
    } catch (error) { warnings.push(`OCR segment ${index + 1} failed: ${error instanceof Error ? error.message : "unknown error"}`); return { text: "", meta: {} }; }
  }));
  const seen = new Set<string>(), lines: string[] = [];
  for (const pass of passResults) for (const line of pass.text.split(/\r?\n/).map(x => x.trim()).filter(Boolean)) { const key = line.toLocaleLowerCase("vi"); if (!seen.has(key)) { seen.add(key); lines.push(line); } }
  const rawText = lines.join("\n");
  if (!rawText) throw new Error("All segmented OCR passes returned empty text");

  let data: unknown = null, annotations: unknown[] = [], structureMeta: Record<string, unknown> = {};
  if (input.output?.schema || input.output?.includeAnnotations !== false) {
    const schema = input.output?.schema ? JSON.stringify(input.output.schema) : '{"type":"object"}';
    try {
      const response = await queryWithSourceFallback(ai, model, image, { ...caller, task: "query", question: `Return ONLY compact JSON {"data":<schema object>,"annotations":[]}. Schema: ${schema}. Unknown or unrelated fields must be null. Do not include OCR text or repeat characters.`, max_tokens: Math.min(requestedMax, 1024), temperature: Math.max(0.1, temperature), top_p: 0.9, stream: false, reasoning: false }, warnings);
      structureMeta = meta(response); const structuredText = cleanOcr(answer(response)); const structured = parseObject(structuredText.text); if (structured) { data = "data" in structured ? structured.data : structured; annotations = Array.isArray(structured.annotations) ? structured.annotations : []; } else warnings.push("Structured pass invalid; returning OCR with data=null"); if (structuredText.repeated) warnings.push("Structured repetition was discarded");
    } catch (error) { warnings.push(`Structured pass failed; returning OCR only: ${error instanceof Error ? error.message : "unknown error"}`); }
  }
  return { value: { rawText, data, annotations, confidence: null }, adapter: "moondream-segmented-ocr", warnings, modelMeta: { ocrSegments: passResults.map(x => x.meta), structure: structureMeta } };
}
export async function runVisionModel(ai: AiBinding, model: string, input: ExtractRequest, image: ResolvedImage, prompt: string): Promise<AdapterResult> { const adapter = selectAdapter(model, input.adapter || "auto"), params = parameters(input); if (adapter === "moondream") return runMoondream(ai, model, input, image); if (adapter === "chat-vision") { const value = await runWithRetry(ai, model, { ...params, stream: false, messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: image.dataUri } }] }] }); return { value, adapter: "chat-vision", warnings: [] }; } const value = await runWithRetry(ai, model, { ...params, image: [...image.bytes], prompt }); return { value, adapter: "image-prompt-bytes", warnings: [] }; }
