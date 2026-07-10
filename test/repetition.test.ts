import { describe, expect, it } from "vitest";
import { cleanOcr } from "../src/model-adapters";

describe("word-level repetition detection", () => {
  it("trims long Vietnamese phrase loops beyond eight characters", () => {
    const loop = Array(8).fill("để tốt lớp").join(" ");
    const result = cleanOcr(`DHG.Hospital Reports\n${loop}`);
    expect(result.repeated).toBe(true);
    expect(result.text).toBe("DHG.Hospital Reports");
  });
  it("keeps normal repeated UI labels", () => {
    const result = cleanOcr("Từ ngày 31/05/2026\nĐến ngày 30/06/2026\nTháng 06/2026");
    expect(result.repeated).toBe(false);
  });
});
