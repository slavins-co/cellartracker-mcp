import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer, formatScores } from "../server.js";

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

describe("tool annotations", () => {
  async function listToolsLive() {
    const server = createServer();
    const client = new Client({ name: "test-client", version: "0.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
    const { tools } = await client.listTools();
    await client.close();
    return tools;
  }

  it("marks all data-query tools read-only and open-world with a title", async () => {
    const tools = await listToolsLive();
    const dataTools = [
      "search-cellar",
      "drinking-recommendations",
      "cellar-stats",
      "purchase-history",
      "get-wishlist",
      "consumption-history",
      "tasting-notes",
      "recent-deliveries",
      "refresh-data",
    ];
    for (const name of dataTools) {
      const tool = tools.find((t) => t.name === name);
      expect(tool, `${name} should be registered`).toBeDefined();
      expect(tool!.annotations?.readOnlyHint).toBe(true);
      expect(tool!.annotations?.openWorldHint).toBe(true);
      expect(tool!.annotations?.title).toBeTruthy();
    }
  });

  it("marks setup-credentials as a write, network-calling tool", async () => {
    const tools = await listToolsLive();
    const tool = tools.find((t) => t.name === "setup-credentials");
    if (!tool) return; // only registered when CT_USERNAME/CT_PASSWORD env vars are absent
    expect(tool.annotations?.readOnlyHint).toBe(false);
    expect(tool.annotations?.openWorldHint).toBe(true);
  });

  it("marks clear-user-data as destructive and non-read-only", async () => {
    const tools = await listToolsLive();
    const tool = tools.find((t) => t.name === "clear-user-data");
    if (!tool) return; // only registered when CT_USERNAME/CT_PASSWORD env vars are absent
    expect(tool.annotations?.readOnlyHint).toBe(false);
    expect(tool.annotations?.destructiveHint).toBe(true);
  });
});

describe("diacritic-insensitive filters in server.ts", () => {
  const serverSrc = fs.readFileSync(path.resolve(__dirname, "../server.ts"), "utf-8");

  it("search-cellar's region filter uses foldDiacritics, not raw toLowerCase", () => {
    const block = serverSrc.slice(
      serverSrc.indexOf("// Region searches across all geographic fields"),
      serverSrc.indexOf("// Apply vintage range filter")
    );
    expect(block).toMatch(/foldDiacritics/);
    expect(block).not.toMatch(/\.toLowerCase\(\)/);
  });

  it("get-wishlist's query filter uses foldDiacritics, not raw toLowerCase", () => {
    const block = serverSrc.slice(
      serverSrc.indexOf('"get-wishlist"'),
      serverSrc.indexOf('"consumption-history"')
    );
    expect(block).toMatch(/foldDiacritics/);
    expect(block).not.toMatch(/\.toLowerCase\(\)/);
  });
});
