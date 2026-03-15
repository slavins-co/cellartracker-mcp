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

  it("returns unrecognized charset as-is (caller handles fallback)", () => {
    expect(parseCharset("text/csv; charset=x-bogus")).toBe("x-bogus");
  });
});

describe("TextDecoder fallback", () => {
  it("falls back to windows-1252 for unrecognized encoding", () => {
    // Simulates the fallback logic in fetchTable: if TextDecoder rejects
    // the encoding, we fall back to windows-1252
    const encoding = parseCharset("text/csv; charset=x-bogus");
    let decoder: TextDecoder;
    try {
      decoder = new TextDecoder(encoding);
    } catch {
      decoder = new TextDecoder("windows-1252");
    }
    expect(decoder.encoding).toBe("windows-1252");
  });

  it("accepts valid encoding from parseCharset", () => {
    const encoding = parseCharset("text/csv; charset=utf-8");
    const decoder = new TextDecoder(encoding);
    expect(decoder.encoding).toBe("utf-8");
  });
});
