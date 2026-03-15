import { describe, it, expect } from "vitest";
import { parseCharset } from "../exporter.js";

describe("parseCharset", () => {
  it("returns windows-1252 when content-type is null", () => {
    expect(parseCharset(null)).toBe("windows-1252");
  });

  it("returns windows-1252 when content-type has no charset", () => {
    expect(parseCharset("text/csv")).toBe("windows-1252");
  });

  it("extracts utf-8 charset", () => {
    expect(parseCharset("text/csv; charset=utf-8")).toBe("utf-8");
  });

  it("extracts charset case-insensitively", () => {
    expect(parseCharset("text/csv; Charset=UTF-8")).toBe("UTF-8");
  });

  it("extracts windows-1252 charset explicitly", () => {
    expect(parseCharset("text/csv; charset=windows-1252")).toBe("windows-1252");
  });

  it("handles charset with extra parameters after it", () => {
    expect(parseCharset("text/csv; charset=utf-8; boundary=something")).toBe("utf-8");
  });

  it("returns windows-1252 for empty string", () => {
    expect(parseCharset("")).toBe("windows-1252");
  });
});
