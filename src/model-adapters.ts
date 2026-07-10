import type { ExtractRequest, ModelAdapter } from "./contracts";
import type { ResolvedImage } from "./image-source";

interface AiBinding { run(model: string, input: Record<string, unknown>): Promise<unknown> }
interface AdapterResult { value: unknown; adapter: string; warnings: string[]; modelMeta?: Record<string, unknown> }
interface CleanedOcr { text: string; repeated: boolean }

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function parameters(input: ExtractRequest): Record<string, unknown> {
  const result = { ...(input.parameters || {}) };
  for (const key of ["image", "prompt", "question", "task", "messages", "stream", "reasoning"]) delete result[key];
  return result;
}
function nestedResult(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const outer = value as Record<string, unknown>;
  return outer.result && typeof outer.result === "object" && !Array.isArray(outer.result) ? outer.result as Record<string, unknown> : outer;
}
function answer(value: unknown): string {
  if (typeof value === "string") return value.trim();
  const result = nestedResult(value);
  for (const key of ["answer", "response", "text", "caption"]) if (typeof result[key] === "string") return (result[key] as string).trim();
  return "";
}
function meta(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const outer = value as Record<string, unknown>, result = nestedResult(value), output: Record<string, unknown> = {};
  if (typeof result.finish_reason === "string") output.finishReason = result.finish_reason;
  if (result.metrics && typeof result.metrics === "object") output.metrics = result.metrics;
  if (outer.usage && typeof outer.usage === "object") output.usage = outer.usage;
  return output;
}
function stripFence(value: string): string { return value.replace(/^```(?:json|text)?\s*/i, "").replace(/\s*```$/, "").trim(); }
function parseObject(value: string): Record<string, unknown> | null {
  try { const parsed = JSON.parse(stripFence(value)); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null; }
  catch { return null; }
}
function normalizedWord(value: string): string { return value.normalize("NFC").toLocaleLowerCase("vi").replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, ""); }

export function cleanOcr(value: string): CleanedOcr {
  const text = stripFence(value);
  const matches = [...text.matchAll(/\S+/gu)];
  const words = matches.map(match => normalizedWord(match[0]));
  for (let window = 1; window <= 8; window++) {
    for (let start = 0; start + window * 4 <= words.length; start++) {
      const unit = words.slice(start, start + window).join(" ");
      if (!unit) continue;
      let repeats = 1;
      while (start + (repeats + 1) * window <= words.length && words.slice(start + repeats * window, start + (repeats + 1) * window).join(" ") === unit) repeats++;
      if (repeats >= 4) {
        const characterIndex = matches[start]?.index ?? text.length;
        return { text: text.slice(0, characterIndex).trim(), repeated: true };
      }
    }
  }
  return { text, repeated: false };
}
function transient(error: unknown): boolean { return /\b(8008|internal server error|temporar|timeout|overloaded)\b/i.test(error instanceof Error ? error.message : String(error)); }
async function runWithRetry(ai: AiBinding, model: string, payload: Record<string, unknown>): Promise<unknown> {
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await ai.run(model, payload); }
    catch (error) { last = error; if (!transient(error) || attempt === 2) throw error; await sleep(250 * 2 ** attempt); }
  }
  throw last;
}
async function queryWithSourceFallback(ai: AiBinding, model: string, image: ResolvedImage, payload: Record<string, unknown>, warnings: string[]): Promise<unknown> {
  const sources = image.originalUrl ? [image.originalUrl, image.dataUri] : [image.dataUri];
  let last: unknown;
  for (let index = 0; index < sources.length; index++) {
    try { const value = await runWithRetry(ai, model, { ...payload, image: sources[index] }); if (index) warnings.push("Model retried downloaded image as data URI"); return value; }
    catch (error) { last = error; if (index === sources.length - 1) throw error; warnings.push("Public URL inference failed; retrying as data URI"); }
  }
  throw last;
}

export function selectAdapter(model: string, requested: ModelAdapter = "auto"): Exclude<ModelAdapter, "auto"> {
  if (requested !== "auto") return requested;
  if (model.includes("/moondream")) return "moondream";
  if (model.includes("mistral-small-3.1") || model.includes("vision-instruct") || model.includes("kimi-k2.7")) return "chat-vision";
  return "image-prompt";
}

async function runOcrProbe(ai: AiBinding, model: string, input: ExtractRequest, image: ResolvedImage, probe: string, index: number, warnings: string[]): Promise<{ text: string; meta: Record<string, unknown> }> {
  const caller = parameters(input);
  delete caller.max_tokens; delete caller.temperature;
  const basePrompt = `OCR exact text only. ${probe} Preserve Vietnamese diacritics. One item per line. No explanation, JSON, summary or repetition.`;
  const first = await queryWithSourceFallback(ai, model, image, { ...caller, task: "query", question: basePrompt, max_tokens: 256, temperature: 0, top_p: 0.85, stream: false, reasoning: false }, warnings);
  const firstClean = cleanOcr(answer(first));
  const firstMeta = meta(first);
  const needsRetry = firstClean.repeated || firstMeta.finishReason === "length";
  if (!needsRetry) return { text: firstClean.text, meta: firstMeta };

  warnings.push(`OCR probe ${index + 1} repeated or hit token limit; retrying once with a shorter deterministic prompt`);
  const retry = await queryWithSourceFallback(ai, model, image, { ...caller, task: "query", question: `Read exact text only for this UI target: ${probe} Return at most 12 short lines. Stop instead of repeating.`, max_tokens: 192, temperature: 0, top_p: 0.8, stream: false, reasoning: false }, warnings);
  const retryClean = cleanOcr(answer(retry));
  if (retryClean.repeated) warnings.push(`OCR probe ${index + 1} retry repetition was trimmed`);
  const candidates = [firstClean.text, retryClean.text].filter(Boolean).sort((a, b) => b.length - a.length);
  return { text: candidates[0] || "", meta: { first: firstMeta, retry: meta(retry) } };
}

async function runMoondream(ai: AiBinding, model: string, input: ExtractRequest, image: ResolvedImage): Promise<AdapterResult> {
  const warnings: string[] = [];
  const probes = [
    "Read the application/window title and every top menu item, left to right.",
    "Read every feature tab/header near the top, especially selected or red-underlined text.",
    "Read all visible times, dates, month/year values and date ranges exactly.",
    "Read filter labels, checkbox/radio labels and selected values.",
    "Read grid tab names, column numbers, column codes and table headers.",
    "Read every action button caption in the lower half.",
    "Read the bottom status bar: working month, logged-in user, copyright owner and full software version.",
    "Read red text, underline, callout, annotation, error or highlighted notice. If none, say NONE."
  ];
  const passResults = await Promise.all(probes.map((probe, index) => runOcrProbe(ai, model, input, image, probe, index, warnings).catch(error => { warnings.push(`OCR probe ${index + 1} failed: ${error instanceof Error ? error.message : "unknown error"}`); return { text: "", meta: {} }; })));
  const seen = new Set<string>(), lines: string[] = [];
  for (const pass of passResults) for (const line of pass.text.split(/\r?\n/).map(value => value.trim()).filter(value => value && value.toUpperCase() !== "NONE")) {
    const key = line.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("vi");
    if (!seen.has(key)) { seen.add(key); lines.push(line); }
  }
  const rawText = lines.join("\n");
  if (!rawText) throw new Error("All targeted OCR probes returned empty text");

  let data: unknown = null, annotations: unknown[] = [], structureMeta: Record<string, unknown> = {};
  if (input.output?.schema || input.output?.includeAnnotations !== false) {
    const caller = parameters(input); delete caller.max_tokens; delete caller.temperature;
    const schema = input.output?.schema ? JSON.stringify(input.output.schema) : '{"type":"object"}';
    try {
      const response = await queryWithSourceFallback(ai, model, image, { ...caller, task: "query", question: `Return ONLY compact JSON with keys data and annotations. data must follow this schema: ${schema}. Unknown or unrelated fields must be null. Do not include OCR text or repeat.`, max_tokens: 512, temperature: 0, top_p: 0.8, stream: false, reasoning: false }, warnings);
      structureMeta = meta(response);
      const cleaned = cleanOcr(answer(response)), structured = parseObject(cleaned.text);
      if (structured) { data = "data" in structured ? structured.data : structured; annotations = Array.isArray(structured.annotations) ? structured.annotations : []; }
      else warnings.push("Structured pass invalid; returning OCR with data=null");
      if (cleaned.repeated) warnings.push("Structured repetition discarded");
    } catch (error) { warnings.push(`Structured pass failed; returning OCR only: ${error instanceof Error ? error.message : "unknown error"}`); }
  }
  return { value: { rawText, data, annotations, confidence: null }, adapter: "moondream-targeted-ocr", warnings, modelMeta: { ocrProbes: passResults.map(result => result.meta), structure: structureMeta } };
}

export async function runVisionModel(ai: AiBinding, model: string, input: ExtractRequest, image: ResolvedImage, prompt: string): Promise<AdapterResult> {
  const adapter = selectAdapter(model, input.adapter || "auto"), params = parameters(input);
  if (adapter === "moondream") return runMoondream(ai, model, input, image);
  if (adapter === "chat-vision") {
    const value = await runWithRetry(ai, model, { ...params, stream: false, messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: image.dataUri } }] }] });
    return { value, adapter: "chat-vision", warnings: [] };
  }
  const value = await runWithRetry(ai, model, { ...params, image: [...image.bytes], prompt });
  return { value, adapter: "image-prompt-bytes", warnings: [] };
}
