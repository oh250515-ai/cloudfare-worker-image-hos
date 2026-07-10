import { describe, expect, it } from "vitest";
import { isModelAllowed, validatePublicImageUrl } from "../src/security";
import { normalizeAiResponse } from "../src/index";

describe("security", () => {
  it("accepts public https images", () => expect(validatePublicImageUrl("https://example.com/a.png").hostname).toBe("example.com"));
  it("rejects local and private hosts", () => {
    expect(() => validatePublicImageUrl("http://example.com/a.png")).toThrow();
    expect(() => validatePublicImageUrl("https://127.0.0.1/a.png")).toThrow();
    expect(() => validatePublicImageUrl("https://192.168.1.2/a.png")).toThrow();
  });
  it("supports configurable Cloudflare models", () => {
    expect(isModelAllowed("@cf/moondream/moondream3.1-9B-A2B")).toBe(true);
    expect(isModelAllowed("other-provider/model")).toBe(false);
  });
});

describe("normalization", () => {
  it("keeps rawText, dynamic data and annotations", () => {
    const output = normalizeAiResponse('{"rawText":"Error 42","data":{"code":42},"annotations":[]}', true, true);
    expect(output.result.rawText).toBe("Error 42");
    expect(output.result.data).toEqual({ code: 42 });
  });
});
