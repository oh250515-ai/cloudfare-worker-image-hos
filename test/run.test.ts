import { describe, expect, it } from "vitest";
import { benchmarkModels, extractText, extractUsage, runModel, summarize } from "../src/run";

const fakeAi = (impl: (model: string) => unknown) => ({ run: async (model: string) => impl(model) });

describe("generic run helpers", () => {
  it("extracts text from Workers AI and chat-completion shapes", () => {
    expect(extractText({ response: "hello" })).toBe("hello");
    expect(extractText({ result: { response: "nested" } })).toBe("nested");
    expect(extractText({ choices: [{ message: { content: "chat" } }] })).toBe("chat");
  });
  it("extracts usage when present", () => {
    expect(extractUsage({ usage: { total_tokens: 9 } })).toEqual({ total_tokens: 9 });
    expect(extractUsage({ response: "x" })).toBeNull();
  });
  it("times a single run", async () => {
    const result = await runModel(fakeAi(() => ({ response: "ok" })), "@cf/x/y", { prompt: "hi" });
    expect(result.text).toBe("ok");
    expect(typeof result.timingMs).toBe("number");
  });
  it("summarizes benchmark runs and records failures", async () => {
    let n = 0;
    const ai = fakeAi(() => { n++; if (n === 2) throw new Error("boom"); return { response: "r" }; });
    const results = await benchmarkModels(ai, ["@cf/a/b"], { prompt: "hi" }, 3);
    expect(results[0].summary.attempts).toBe(3);
    expect(results[0].summary.ok).toBe(2);
    expect(results[0].runs.find(r => !r.ok)?.error).toBe("boom");
  });
  it("summarize handles empty", () => { expect(summarize([]).avgMs).toBeNull(); });
});
