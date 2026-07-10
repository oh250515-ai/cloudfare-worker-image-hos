import { describe, expect, it } from "vitest";
import { normalizeAiResponse, unwrapModelEnvelope } from "../src/index";

describe("nested Workers AI responses", () => {
  it("unwraps result.answer instead of leaking usage into data", () => {
    const value = { result: { answer: '{"rawText":"hello","data":{"title":"doc"},"annotations":[]}', finish_reason: "stop", metrics: { output_tokens: 10 } }, usage: { total_tokens: 20 } };
    expect(unwrapModelEnvelope(value).content).toContain("rawText");
    const normalized = normalizeAiResponse(value, true, true);
    expect(normalized.result.rawText).toBe("hello");
    expect(normalized.result.data).toEqual({ title: "doc" });
    expect(normalized.modelMeta.usage).toEqual({ total_tokens: 20 });
  });
  it("preserves truncated invalid JSON as rawText and reports length", () => {
    const value = { result: { answer: '{"rawText":"abc', finish_reason: "length" } };
    const normalized = normalizeAiResponse(value, true, true);
    expect(normalized.result.rawText).toBe('{"rawText":"abc');
    expect(normalized.result.data).toBeNull();
    expect(normalized.warnings.join(" ")).toContain("truncated");
  });
});
