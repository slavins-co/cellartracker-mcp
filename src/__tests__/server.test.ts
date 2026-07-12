import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { formatScores } from "../server.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("server version", () => {
  it("reads version from package.json, not a hardcoded string", () => {
    const serverSrc = fs.readFileSync(
      path.resolve(__dirname, "../server.ts"),
      "utf-8"
    );
    // The server should not contain a hardcoded version string like version: "0.2.6"
    // Instead it should read from package.json
    const hardcodedVersion = /version:\s*"[\d.]+"/;
    expect(serverSrc).not.toMatch(hardcodedVersion);
  });

  it("includes the server version in refresh-data output", () => {
    const serverSrc = fs.readFileSync(
      path.resolve(__dirname, "../server.ts"),
      "utf-8"
    );
    const refreshDataBlock = serverSrc.slice(
      serverSrc.indexOf('"refresh-data"'),
      serverSrc.indexOf('"setup-credentials"')
    );
    // Must dynamically interpolate the version constant, not a hardcoded string
    expect(refreshDataBlock).toMatch(/Server: cellartracker-mcp v\$\{version\}/);
  });
});

describe("formatScores", () => {
  it("rounds long decimal scores to 1 decimal place", () => {
    const row = { CT: "91.9254658385093", WA: "92.0833333333333" };
    expect(formatScores(row, ["CT", "WA"])).toBe("CT:91.9, WA:92.1");
  });

  it("does not add a trailing .0 to whole-number scores", () => {
    const row = { CT: "92" };
    expect(formatScores(row, ["CT"])).toBe("CT:92");
  });

  it("still excludes literal zero-sentinel scores", () => {
    const row = { CT: "0", WA: "0.0", WS: "95.5" };
    expect(formatScores(row, ["CT", "WA", "WS"])).toBe("WS:95.5");
  });

  it("excludes a near-zero value that rounds down to the zero sentinel", () => {
    const row = { CT: "0.04" };
    expect(formatScores(row, ["CT"])).toBe("no scores");
  });

  it("returns 'no scores' when nothing is present", () => {
    expect(formatScores({}, ["CT"])).toBe("no scores");
  });
});
