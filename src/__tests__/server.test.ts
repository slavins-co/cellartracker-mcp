import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
