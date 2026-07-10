import type { ExtractRequest, ModelAdapter } from "./contracts";
import type { ResolvedImage } from "./image-source";

interface AiBinding { run(model: string, input: Record<string, unknown>): Promise<unknown> }
interface AdapterResult { value: unknown; adapter: string; warnings: string[]; modelMeta?: Record<string, unknown> }

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
function stripFence(value: string): string { return value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim(); }
function parseObject(value: string): Record<string, unknown> | null {
  try { const parsed = JSON.parse(stripFence(value)); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null; } catch { return null; }
}
function repeated(value: string): boolean { return /(.)\1{31,}/su.test(value) || /(.{2,8})\1{15,}/su.test(value); }
function imageInput(image: ResolvedImage): string { return image.originalUrl || image.dataUri; }

export function selectAdapter(model: string, requested: ModelAdapter = "auto"): Exclude<ModelAdapter, "auto"> {
  if (requested !== "auto") return requested;
  if (model.includes("/moondream")) return "moondream";
  if (model.includes("mistral-small-3.1") || model.includes("vision-instruct")) return "chat-vision";
  return "image-prompt";
}

async function runMoondream(ai: AiBinding, model: string, input: ExtractRequest, image: ResolvedImage): Promise<AdapterResult> {
  const caller = parameters(input);
  const maxTokens = Math.max(1024, Math.min(Number(caller.max_tokens || 4096), 8192));
  const temperature = Number(caller.temperature ?? 0.2) === 0 ? 0.2 : Number(caller.temperature ?? 0.2);
  delete caller.max_tokens; delete caller.temperature;

  // Pass 1 is deliberately schema-free. Mixing complete OCR and an unrelated schema
  // caused Moondream to force text into fields and enter repetition loops.
  const ocrResponse = await ai.run(model, {
    ...caller,
    task: "query",
    image: imageInput(image),
    question: "OCR only. Transcribe ALL visible text exactly in natural reading order, including title bar, menus, tabs, labels, dates, status bar, red underlines, callouts and annotations. Preserve Vietnamese diacritics. Do not summarize. Do not return JSON. Do not repeat text.",
    max_tokens: maxTokens,
    temperature,
    top_p: 0.9,
    stream: false,
    reasoning: false
  });
  const rawText = answer(ocrResponse);
  const warnings: string[] = [];
  const ocrMeta = meta(ocrResponse);
  if (!rawText) warnings.push("OCR pass returned empty text");
  if (ocrMeta.finishReason === "length") warnings.push("OCR pass reached max_tokens and may be incomplete");
  if (repeated(rawText)) warnings.push("OCR pass contains a repetition loop; consider a larger vision model");

  let data: unknown = null;
  let annotations: unknown[] = [];
  let structureMeta: Record<string, unknown> = {};
  if (input.output?.schema || input.output?.includeAnnotations !== false) {
    const schema = input.output?.schema ? JSON.stringify(input.output.schema) : '{"type":"object"}';
    const structureResponse = await ai.run(model, {
      ...caller,
      task: "query",
      image: imageInput(image),
      question: `Extract structured facts from this image. Return ONLY compact valid JSON: {"data":<object following schema>,"annotations":[{"type":string,"text":string|null,"color":string|null,"bbox":[x1,y1,x2,y2]|null}]}. Schema: ${schema}. Set unrelated or unknown fields to null. Do not include full OCR text. Do not repeat characters.`,
      max_tokens: Math.min(maxTokens, 2048),
      temperature: Math.max(0.1, temperature),
      top_p: 0.9,
      stream: false,
      reasoning: false
    });
    structureMeta = meta(structureResponse);
    const structuredText = answer(structureResponse);
    const structured = parseObject(structuredText);
    if (structured) {
      data = "data" in structured ? structured.data : structured;
      annotations = Array.isArray(structured.annotations) ? structured.annotations : [];
    } else warnings.push("Structured pass returned invalid JSON; rawText remains available from the independent OCR pass");
    if (structureMeta.finishReason === "length") warnings.push("Structured pass reached max_tokens; use a matching/smaller schema or larger model");
    if (repeated(structuredText)) warnings.push("Structured pass contains a repetition loop; schema may not match the image");
  }

  return {
    value: { rawText: rawText || null, data, annotations, confidence: null },
    adapter: "moondream-two-pass",
    warnings,
    modelMeta: { ocr: ocrMeta, structure: structureMeta }
  };
}

export async function runVisionModel(ai: AiBinding, model: string, input: ExtractRequest, image: ResolvedImage, prompt: string): Promise<AdapterResult> {
  const adapter = selectAdapter(model, input.adapter || "auto");
  const params = parameters(input);
  if (adapter === "moondream") return runMoondream(ai, model, input, image);
  if (adapter === "chat-vision") {
    const value = await ai.run(model, { ...params, stream: false, messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: image.dataUri } }] }] });
    return { value, adapter: "chat-vision", warnings: [] };
  }
  const value = await ai.run(model, { ...params, image: [...image.bytes], prompt });
  return { value, adapter: "image-prompt-bytes", warnings: [] };
}
