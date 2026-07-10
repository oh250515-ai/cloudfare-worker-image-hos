import type { ExtractRequest, ModelAdapter } from "./contracts";
import type { ResolvedImage } from "./image-source";

interface AiBinding { run(model: string, input: Record<string, unknown>): Promise<unknown> }

function parameters(input: ExtractRequest): Record<string, unknown> {
  const result = { ...(input.parameters || {}) };
  for (const key of ["image", "prompt", "question", "task", "messages", "stream"]) delete result[key];
  return result;
}

export function selectAdapter(model: string, requested: ModelAdapter = "auto"): Exclude<ModelAdapter, "auto"> {
  if (requested !== "auto") return requested;
  if (model.includes("/moondream")) return "moondream";
  if (model.includes("mistral-small-3.1") || model.includes("vision-instruct")) return "chat-vision";
  return "image-prompt";
}

export async function runVisionModel(ai: AiBinding, model: string, input: ExtractRequest, image: ResolvedImage, prompt: string): Promise<{ value: unknown; adapter: string; warnings: string[] }> {
  const adapter = selectAdapter(model, input.adapter || "auto");
  const params = parameters(input);
  if (adapter === "moondream") {
    // Cloudflare's current model page shows byte-array + prompt in its Worker usage example.
    // Prefer that path for OCR; retain task/query + data URI as a compatibility fallback.
    try {
      const value = await ai.run(model, { ...params, image: [...image.bytes], prompt, stream: false });
      return { value, adapter: "image-prompt-bytes", warnings: [] };
    } catch (firstError) {
      const value = await ai.run(model, { ...params, task: "query", image: image.dataUri, question: prompt, stream: false, reasoning: false });
      return { value, adapter: "moondream-query", warnings: [`Moondream byte adapter failed; query adapter succeeded: ${firstError instanceof Error ? firstError.message : "unknown adapter error"}`] };
    }
  }
  if (adapter === "chat-vision") {
    const value = await ai.run(model, { ...params, stream: false, messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: image.dataUri } }] }] });
    return { value, adapter: "chat-vision", warnings: [] };
  }
  const value = await ai.run(model, { ...params, image: [...image.bytes], prompt, stream: false });
  return { value, adapter: "image-prompt-bytes", warnings: [] };
}
