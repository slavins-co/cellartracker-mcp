import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { TABLES, ensureFresh, getCacheAge, parseCharset } from "../exporter.js";

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

const TABLE_NAMES = Object.keys(TABLES);

/** Create a fresh temp cache dir; caller removes it. */
function makeCacheDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ct-cache-"));
}

/** Write a `_latest.csv` for every table with the given mtime (default: now). */
function seedFreshCache(cacheDir: string, mtimeMs = Date.now()): void {
  const seconds = mtimeMs / 1000;
  for (const name of TABLE_NAMES) {
    const p = path.join(cacheDir, `${name}_latest.csv`);
    fs.writeFileSync(p, "iWine,Wine\n123,Test\n", "utf-8");
    fs.utimesSync(p, seconds, seconds);
  }
}

/** Backdate one table's `_latest.csv` to `hoursAgo` old (simulates a stale table). */
function makeStale(cacheDir: string, table: string, hoursAgo = 48): void {
  const seconds = (Date.now() - hoursAgo * 3600 * 1000) / 1000;
  fs.utimesSync(path.join(cacheDir, `${table}_latest.csv`), seconds, seconds);
}

/** Mock global.fetch to return valid CSV; returns the spy for call counting. */
function stubFetchSuccess(): ReturnType<typeof vi.fn> {
  const mock = vi.fn(
    async () =>
      new Response("iWine,Wine\n123,Test\n", {
        status: 200,
        headers: { "content-type": "text/csv; charset=utf-8" },
      })
  );
  vi.stubGlobal("fetch", mock);
  return mock;
}

/**
 * Register a fresh temp cache dir per test and always tear it down: unstub any
 * globals (e.g. a stubbed fetch) and remove the dir. Returns a getter for the
 * current dir. Single place to change the cleanup strategy for every suite below,
 * so a stubbed fetch can't leak into a later suite.
 */
function useTempCacheDir(): () => string {
  let cacheDir = "";
  beforeEach(() => {
    cacheDir = makeCacheDir();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    fs.rmSync(cacheDir, { recursive: true, force: true });
  });
  return () => cacheDir;
}

describe("getCacheAge (issue #43 — oldest, not newest)", () => {
  const dir = useTempCacheDir();

  it("reports the age of the OLDEST _latest.csv, not the newest", () => {
    // Simulate a partial-failure refresh: 7 tables rewritten just now,
    // 1 table left stale at 48h old.
    seedFreshCache(dir(), Date.now());
    makeStale(dir(), TABLE_NAMES[0]);

    const ageMs = getCacheAge(dir());
    // Newest-based (old bug) would return ~0; oldest-based returns ~48h.
    expect(ageMs).not.toBeNull();
    expect(ageMs!).toBeGreaterThan(24 * 3600 * 1000);
  });

  it("returns a small age when every _latest.csv is fresh", () => {
    seedFreshCache(dir(), Date.now());
    const ageMs = getCacheAge(dir());
    expect(ageMs).not.toBeNull();
    expect(ageMs!).toBeLessThan(60 * 1000);
  });

  it("returns null for an empty cache dir", () => {
    expect(getCacheAge(dir())).toBeNull();
  });
});

describe("ensureFresh cache freshness (issue #43)", () => {
  const dir = useTempCacheDir();

  it("does NOT re-export when all 8 _latest.csv are fresh", async () => {
    seedFreshCache(dir(), Date.now());
    const mock = stubFetchSuccess();

    const paths = await ensureFresh("user", "pass", dir());

    expect(mock).not.toHaveBeenCalled();
    expect(Object.keys(paths).length).toBe(TABLE_NAMES.length);
  });

  it("re-exports when one _latest.csv is stale (partial-failure self-heal)", async () => {
    seedFreshCache(dir(), Date.now());
    makeStale(dir(), TABLE_NAMES[0]);
    const mock = stubFetchSuccess();

    await ensureFresh("user", "pass", dir());

    expect(mock).toHaveBeenCalledTimes(TABLE_NAMES.length);
  });
});

describe("ensureFresh in-flight dedup (issue #44)", () => {
  const dir = useTempCacheDir();

  it("collapses concurrent refreshes into exactly one set of fetches", async () => {
    const mock = stubFetchSuccess(); // empty cache → both callers want a refresh

    await Promise.all([
      ensureFresh("user", "pass", dir()),
      ensureFresh("user", "pass", dir()),
    ]);

    // Without dedup this would be 2 × 8 = 16.
    expect(mock).toHaveBeenCalledTimes(TABLE_NAMES.length);
  });

  it("rejects all waiters on failure, then a later call starts a fresh refresh", async () => {
    const mock = vi.fn(async () => {
      throw new Error("network down");
    });
    vi.stubGlobal("fetch", mock);

    const p1 = ensureFresh("user", "pass", dir());
    const p2 = ensureFresh("user", "pass", dir());
    await expect(p1).rejects.toThrow();
    await expect(p2).rejects.toThrow();

    // A single shared refresh was attempted (8 fetches), not two.
    expect(mock).toHaveBeenCalledTimes(TABLE_NAMES.length);

    // Slot cleared on failure — the next call must start a brand-new refresh.
    mock.mockClear();
    const success = stubFetchSuccess();
    await ensureFresh("user", "pass", dir());
    expect(success).toHaveBeenCalledTimes(TABLE_NAMES.length);
  });

  it("scopes the in-flight promise per cacheDir", async () => {
    const dirA = dir();
    const dirB = makeCacheDir();
    try {
      const mock = stubFetchSuccess();
      await Promise.all([
        ensureFresh("user", "pass", dirA),
        ensureFresh("user", "pass", dirB),
      ]);
      // Two distinct cache dirs → two independent refreshes → 2 × 8.
      expect(mock).toHaveBeenCalledTimes(TABLE_NAMES.length * 2);
    } finally {
      fs.rmSync(dirB, { recursive: true, force: true });
    }
  });
});
