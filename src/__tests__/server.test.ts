import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer, formatScores, wineUrl, scoresRecord, toWineRow } from "../server.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("scoresRecord", () => {
  it("returns a numeric record rounded to 1 decimal", () => {
    expect(scoresRecord({ CT: "91.9254658385093", WA: "92.0833333333333" }, ["CT", "WA"])).toEqual({
      CT: 91.9,
      WA: 92.1,
    });
  });

  it("drops the literal and near-zero score sentinels", () => {
    expect(scoresRecord({ CT: "0", WA: "0.0", WS: "0.04", AG: "95.5" }, ["CT", "WA", "WS", "AG"])).toEqual({
      AG: 95.5,
    });
  });

  it("returns undefined when no numeric scores are present", () => {
    expect(scoresRecord({ CT: "0" }, ["CT"])).toBeUndefined();
    expect(scoresRecord({}, ["CT"])).toBeUndefined();
  });
});

describe("toWineRow", () => {
  it("maps required fields, numeric quantity/price, and a deep-link url", () => {
    const row = {
      iWine: "4724491",
      Wine: "Château Test",
      Vintage: "2018",
      Quantity: "3",
      Price: "45.50",
      Color: "Red",
      Region: "Bordeaux",
    };
    const out = toWineRow(row);
    expect(out.iWine).toBe("4724491");
    expect(out.wine).toBe("Château Test");
    expect(out.vintage).toBe("2018");
    expect(out.quantity).toBe(3);
    expect(out.price).toBe(45.5);
    expect(out.color).toBe("Red");
    expect(out.region).toBe("Bordeaux");
    expect(out.url).toBe("https://www.cellartracker.com/wine.asp?iWine=4724491");
  });

  it("normalizes the NV vintage sentinel and omits absent optionals", () => {
    const out = toWineRow({ iWine: "9", Wine: "NV Champagne", Vintage: "1001" });
    expect(out.vintage).toBe("NV");
    expect(out.quantity).toBeUndefined();
    expect(out.price).toBeUndefined();
    expect(out.location).toBeUndefined();
    expect("color" in out).toBe(false);
  });
});

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

describe("wineUrl", () => {
  it("builds a wine.asp URL from a numeric iWine id", () => {
    expect(wineUrl("4724491")).toBe("https://www.cellartracker.com/wine.asp?iWine=4724491");
  });

  it("returns undefined for a missing iWine", () => {
    expect(wineUrl(undefined)).toBeUndefined();
  });

  it("returns undefined for an empty or whitespace-only iWine", () => {
    expect(wineUrl("")).toBeUndefined();
    expect(wineUrl("   ")).toBeUndefined();
  });
});

describe("fmtWine deep link", () => {
  it("calls wineUrl and gates the Link line on its result", () => {
    const serverSrc = fs.readFileSync(path.resolve(__dirname, "../server.ts"), "utf-8");
    const block = serverSrc.slice(
      serverSrc.indexOf("function fmtWine"),
      serverSrc.indexOf("function maturityLabel")
    );
    expect(block).toMatch(/wineUrl\(row\.iWine\)/);
    expect(block).toMatch(/if \(link\) lines\.push\(`\s*Link: \$\{link\}`\)/);
  });
});

describe("drinking-recommendations deep link", () => {
  it("calls wineUrl and gates the Link line on its result", () => {
    const serverSrc = fs.readFileSync(path.resolve(__dirname, "../server.ts"), "utf-8");
    const block = serverSrc.slice(
      serverSrc.indexOf('"drinking-recommendations"'),
      serverSrc.indexOf('"cellar-stats"')
    );
    expect(block).toMatch(/wineUrl\(row\.iWine\)/);
    expect(block).toMatch(/if \(link\) lines\.push\(`\s*Link: \$\{link\}`\)/);
  });
});

describe("tool annotations", () => {
  const originalEnv = { CT_USERNAME: process.env.CT_USERNAME, CT_PASSWORD: process.env.CT_PASSWORD };
  let tools: Awaited<ReturnType<Client["listTools"]>>["tools"];

  beforeAll(async () => {
    // Clear env credentials so setup-credentials/clear-user-data are deterministically
    // registered, regardless of the ambient shell environment running the suite.
    delete process.env.CT_USERNAME;
    delete process.env.CT_PASSWORD;

    const server = createServer();
    const client = new Client({ name: "test-client", version: "0.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
    ({ tools } = await client.listTools());
    await Promise.all([client.close(), server.close()]);
  });

  afterAll(() => {
    if (originalEnv.CT_USERNAME !== undefined) process.env.CT_USERNAME = originalEnv.CT_USERNAME;
    else delete process.env.CT_USERNAME;
    if (originalEnv.CT_PASSWORD !== undefined) process.env.CT_PASSWORD = originalEnv.CT_PASSWORD;
    else delete process.env.CT_PASSWORD;
  });

  it("marks all data-query tools read-only and open-world with a title", () => {
    const dataTools = [
      "search-cellar",
      "drinking-recommendations",
      "cellar-stats",
      "purchase-history",
      "get-wishlist",
      "consumption-history",
      "tasting-notes",
      "recent-deliveries",
      "incoming-orders",
      "bottle-details",
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

  it("marks setup-credentials as a write, network-calling tool", () => {
    const tool = tools.find((t) => t.name === "setup-credentials");
    expect(tool).toBeDefined();
    expect(tool!.annotations?.readOnlyHint).toBe(false);
    expect(tool!.annotations?.openWorldHint).toBe(true);
    expect(tool!.annotations?.title).toBeTruthy();
  });

  it("marks clear-user-data as destructive, non-read-only, and local-only", () => {
    const tool = tools.find((t) => t.name === "clear-user-data");
    expect(tool).toBeDefined();
    expect(tool!.annotations?.readOnlyHint).toBe(false);
    expect(tool!.annotations?.destructiveHint).toBe(true);
    // Explicit false matters: the spec default for openWorldHint is true,
    // but this tool never touches the network
    expect(tool!.annotations?.openWorldHint).toBe(false);
    expect(tool!.annotations?.title).toBeTruthy();
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

describe("recent-deliveries empty-window hint", () => {
  it("surfaces mostRecentDeliveryDate when the window has no deliveries", () => {
    const serverSrc = fs.readFileSync(path.resolve(__dirname, "../server.ts"), "utf-8");
    const block = serverSrc.slice(
      serverSrc.indexOf('"recent-deliveries"'),
      serverSrc.indexOf('"get-wishlist"')
    );
    expect(block).toMatch(/mostRecentDeliveryDate/);
  });
});

describe("bottle-details tool", () => {
  const serverSrc = fs.readFileSync(path.resolve(__dirname, "../server.ts"), "utf-8");
  const block = serverSrc.slice(
    serverSrc.indexOf('"bottle-details"'),
    serverSrc.indexOf('"get-wishlist"')
  );

  it("reads the Bottles table, not List/Inventory", () => {
    expect(block).toMatch(/loadTable\(paths\.Bottles\)/);
  });

  it("delegates filtering/sorting to the bottleDetails query helper", () => {
    expect(block).toMatch(/bottleDetails\(/);
  });

  it("exposes a barcode filter param (for photo-read lookups)", () => {
    expect(block).toMatch(/barcode:/);
  });

  it("points a location/bin miss at cellar-stats to discover real values", () => {
    // The differentiator vs a bare 'not found': CT Location/Bin are opaque
    // account labels, so on a location/bin miss we must name the discovery path.
    expect(block).toMatch(/cellar-stats/);
  });

  it("gates the cellar-stats pointer on a secondary location/bin-only check", () => {
    // The pointer must only fire when the location/bin value itself matched
    // nothing — not on any empty result that merely happens to include a
    // location/bin filter (else a wine/size/barcode/state miss is misdiagnosed
    // as a bad location label). Verified by a re-query on {location, bin} alone.
    expect(block).toMatch(/bottleDetails\(\s*bottleRows,\s*\{\s*location,\s*bin\s*\},\s*"all"\s*\)/);
  });
});

describe("cellar-stats group_by=bin", () => {
  const serverSrc = fs.readFileSync(path.resolve(__dirname, "../server.ts"), "utf-8");
  const block = serverSrc.slice(
    serverSrc.indexOf('"cellar-stats"'),
    serverSrc.indexOf('"purchase-history"')
  );

  it("maps the bin option to the Bin column in columnMap", () => {
    // bottle-details points a location/bin miss at cellar-stats(group_by=bin),
    // so bin must be an accepted breakdown dimension or that pointer is a dead end.
    expect(block).toMatch(/bin:\s*"Bin"/);
  });

  it("lists bin among the valid group_by options in the tool description", () => {
    expect(block).toMatch(/Valid group_by options:[^"]*bin/);
  });
});
