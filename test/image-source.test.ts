import { describe, expect, it } from "vitest";
import { decodeBase64 } from "../src/image-source";
import { selectAdapter } from "../src/model-adapters";

describe("image sources", () => {
  it("accepts raw base64", () => { const value = decodeBase64("aGVsbG8=", "image/png", 100); expect(value.source).toBe("base64"); expect(value.bytes.length).toBe(5); });
  it("accepts image data URIs", () => { const value = decodeBase64("data:image/jpeg;base64,aGVsbG8=", "image/png", 100); expect(value.mimeType).toBe("image/jpeg"); });
  it("rejects invalid and oversized base64", () => { expect(() => decodeBase64("%%%", "image/png", 100)).toThrow(); expect(() => decodeBase64("aGVsbG8=", "image/png", 2)).toThrow(); });
});

describe("model adapters", () => {
  it("selects known model families", () => { expect(selectAdapter("@cf/moondream/moondream3.1-9B-A2B")).toBe("moondream"); expect(selectAdapter("@cf/mistralai/mistral-small-3.1-24b-instruct")).toBe("chat-vision"); expect(selectAdapter("@cf/llava-hf/llava-1.5-7b-hf")).toBe("image-prompt"); });
  it("respects explicit adapter", () => expect(selectAdapter("@cf/custom/model", "chat-vision")).toBe("chat-vision"));
});
