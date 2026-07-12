import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer, formatScores, wineUrl, scoresRecord, toWineRow, clampOffset, paginationFooter } from "../server.js";

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

describe("clampOffset", () => {
  it("passes through a positive integer", () => {
    expect(clampOffset(5)).toBe(5);
  });

  it("floors a non-integer offset", () => {
    expect(clampOffset(5.7)).toBe(5);
  });

  it("defaults undefined, zero, and negative values to 0", () => {
    expect(clampOffset(undefined)).toBe(0);
    expect(clampOffset(0)).toBe(0);
    expect(clampOffset(-3)).toBe(0);
  });
});

describe("paginationFooter", () => {
  it("returns undefined when the page reaches the end of the result set", () => {
    expect(paginationFooter(0, 3, 3)).toBeUndefined();
    expect(paginationFooter(1, 2, 3)).toBeUndefined();
  });

  it("formats a 1-indexed range and the next offset when more results remain", () => {
    expect(paginationFooter(0, 1, 3)).toBe("(Showing 1-1 of 3. Pass offset=1 for the next page.)");
    expect(paginationFooter(1, 1, 3)).toBe("(Showing 2-2 of 3. Pass offset=2 for the next page.)");
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

// --- Structured output (Slice A): fixture-cache InMemory callTool harness ---
//
// Point CT_CACHE_DIR at a temp dir seeded with fresh-mtime <Table>_latest.csv
// fixtures + dummy env creds, so getFreshPaths()→ensureFresh() sees a fresh
// cache and never touches the network. Each tool call asserts that the SDK
// accepted structuredContent (a resolved callTool means server-side output
// validation passed — mcp.js throws otherwise) and that it agrees with the
// text output on counts/key values.

const CSV_ESC = (v: string): string => `"${String(v).replace(/"/g, '""')}"`;
function csv(headers: string[], rows: Record<string, string>[]): string {
  const lines = [headers.map(CSV_ESC).join(",")];
  for (const r of rows) lines.push(headers.map((h) => CSV_ESC(r[h] ?? "")).join(","));
  return lines.join("\n") + "\n";
}

/** Minimal fixtures — only the columns the tools read. */
const FIXTURES: Record<string, string> = {
  List: csv(
    ["iWine", "Wine", "Vintage", "Quantity", "Location", "Bin", "Price", "Valuation", "Color", "Country", "Region", "Varietal", "Category", "BeginConsume", "EndConsume", "CT", "WA"],
    [
      { iWine: "101", Wine: "Château Alpha", Vintage: "2018", Quantity: "3", Location: "Cellar A", Bin: "1-2", Price: "50", Color: "Red", Country: "France", Region: "Bordeaux", Varietal: "Cabernet", Category: "1", CT: "92" },
      { iWine: "102", Wine: "Domaine Beta", Vintage: "2020", Quantity: "6", Location: "Fridge", Price: "30", Color: "White", Country: "France", Region: "Burgundy", Varietal: "Chardonnay", Category: "1", CT: "90" },
      { iWine: "103", Wine: "Barolo Gamma", Vintage: "2016", Quantity: "2", Location: "Cellar A", Bin: "1-10", Price: "80", Color: "Red", Country: "Italy", Region: "Piedmont", Varietal: "Nebbiolo", Category: "1", CT: "95" },
    ]
  ),
  Availability: csv(
    ["iWine", "Available", "EndConsume", "CT", "WA", "WS", "JR", "AG"],
    [
      { iWine: "101", Available: "1.2", EndConsume: "2024", CT: "92" },
      { iWine: "102", Available: "0.8", EndConsume: "2030", CT: "90" },
      { iWine: "103", Available: "0.5", EndConsume: "2035", CT: "95" },
    ]
  ),
  Purchase: csv(
    ["iWine", "PurchaseDate", "DeliveryDate", "StoreName", "Price", "Quantity", "Delivered", "Wine", "Vintage"],
    [
      { iWine: "101", PurchaseDate: "6/1/2026", DeliveryDate: "6/15/2026", StoreName: "K&L", Price: "50", Quantity: "3", Delivered: "true", Wine: "Château Alpha", Vintage: "2018" },
      { iWine: "102", PurchaseDate: "5/1/2026", DeliveryDate: "5/1/2026", StoreName: "Wine.com", Price: "30", Quantity: "6", Delivered: "false", Wine: "Domaine Beta", Vintage: "2020" },
    ]
  ),
  Consumed: csv(
    ["iWine", "Consumed", "Wine", "Vintage", "Color", "ShortType", "ConsumptionNote", "Value", "Location"],
    [
      { iWine: "101", Consumed: "3/1/2026", Wine: "Château Alpha", Vintage: "2018", Color: "Red", ShortType: "Drank", ConsumptionNote: "With steak", Value: "55", Location: "Cellar A" },
      { iWine: "103", Consumed: "2/1/2026", Wine: "Barolo Gamma", Vintage: "2016", Color: "Red" },
    ]
  ),
  Notes: csv(
    ["iWine", "TastingDate", "Wine", "Vintage", "Color", "Rating", "TastingNotes", "CScore", "EventTitle"],
    [
      { iWine: "101", TastingDate: "3/2/2026", Wine: "Château Alpha", Vintage: "2018", Color: "Red", Rating: "92", TastingNotes: "Lovely", CScore: "90", EventTitle: "Dinner" },
      { iWine: "102", TastingDate: "1/15/2026", Wine: "Domaine Beta", Vintage: "2020", Rating: "88" },
    ]
  ),
  Tag: csv(
    ["ListName", "Wine", "Vintage", "WinesNotes", "MaxPrice", "Region", "Varietal", "Country"],
    [
      { ListName: "*Wishlist", Wine: "Screaming Eagle", Vintage: "2019", WinesNotes: "Splurge", MaxPrice: "400", Region: "Napa", Varietal: "Cabernet", Country: "USA" },
      { ListName: "*Wishlist", Wine: "Krug", Vintage: "1001" },
      { ListName: "Cellar Defense", Wine: "Not A Wishlist Wine", Vintage: "2015" },
    ]
  ),
  Bottles: csv(
    ["BottleState", "Barcode", "iWine", "Vintage", "Wine", "Quantity", "BottleSize", "Location", "Bin", "ConsumptionDate", "ShortType"],
    [
      { BottleState: "1", Barcode: "ABC123", iWine: "101", Vintage: "2018", Wine: "Château Alpha", Quantity: "1", BottleSize: "750ml", Location: "Cellar A", Bin: "1-2" },
      { BottleState: "1", Barcode: "ABC124", iWine: "103", Vintage: "2016", Wine: "Barolo Gamma", Quantity: "1", BottleSize: "750ml", Location: "Cellar A", Bin: "1-10" },
      { BottleState: "0", Barcode: "ABC125", iWine: "102", Vintage: "2020", Wine: "Domaine Beta", BottleSize: "750ml", ConsumptionDate: "3/1/2026", ShortType: "Drank" },
    ]
  ),
  Pending: csv(
    ["iWine", "PurchaseDate", "StoreName", "Price", "Quantity", "Delivered", "Wine", "Vintage"],
    [
      { iWine: "104", PurchaseDate: "7/1/2026", StoreName: "Futures", Price: "120", Quantity: "3", Delivered: "false", Wine: "Pending Alpha", Vintage: "2022" },
      { iWine: "105", PurchaseDate: "6/20/2026", StoreName: "Futures", Price: "60", Quantity: "1", Delivered: "false", Wine: "Pending Beta", Vintage: "2021" },
    ]
  ),
};

/** Read a callTool result's text content. */
function textOf(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const content = result.content as { type: string; text?: string }[];
  return content.filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n");
}

describe("structured output — data tools (fixture cache)", () => {
  const savedEnv: Record<string, string | undefined> = {};
  let tmpDir: string;
  let client: Client;
  let server: ReturnType<typeof createServer>;

  const call = (name: string, args: Record<string, unknown> = {}) =>
    client.callTool({ name, arguments: args });

  beforeAll(async () => {
    for (const k of ["CT_CACHE_DIR", "CT_USERNAME", "CT_PASSWORD"]) savedEnv[k] = process.env[k];
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ct-fixture-"));
    for (const [table, body] of Object.entries(FIXTURES)) {
      fs.writeFileSync(path.join(tmpDir, `${table}_latest.csv`), body, "utf-8");
    }
    process.env.CT_CACHE_DIR = tmpDir;
    // Set creds so ensureFresh has them (never used — cache is fresh) and so the
    // conditional setup/clear tools aren't registered here.
    process.env.CT_USERNAME = "test-user";
    process.env.CT_PASSWORD = "test-pass";

    server = createServer();
    client = new Client({ name: "test-client", version: "0.0.0" });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(ct), server.connect(st)]);
  });

  afterAll(async () => {
    // Restore env + remove the temp dir even if close() rejects, so test creds
    // or the deleted-creds state can't leak into a later describe block.
    try {
      await Promise.all([client.close(), server.close()]);
    } finally {
      for (const [k, v] of Object.entries(savedEnv)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("search-cellar returns structured wines agreeing with the text count", async () => {
    const r = await call("search-cellar", {});
    const sc = r.structuredContent as { total: number; offset: number; count: number; wines: { iWine: string; url?: string }[] };
    expect(sc.total).toBe(3);
    expect(sc.offset).toBe(0);
    expect(sc.count).toBe(3);
    expect(sc.wines).toHaveLength(3);
    expect(sc.wines[0].url).toMatch(/wine\.asp\?iWine=/);
    expect(textOf(r)).toContain("Found 3 wine(s)");
  });

  it("search-cellar empty result still returns valid zero-filled structured output", async () => {
    const r = await call("search-cellar", { query: "NoSuchWineXYZ" });
    const sc = r.structuredContent as { total: number; count: number; wines: unknown[] };
    expect(sc.total).toBe(0);
    expect(sc.count).toBe(0);
    expect(sc.wines).toHaveLength(0);
    expect(textOf(r)).toContain("No wines found");
  });

  it("search-cellar offset skips the requested number of results", async () => {
    const r = await call("search-cellar", { offset: 1 });
    const sc = r.structuredContent as { total: number; offset: number; count: number; wines: { iWine: string }[] };
    expect(sc.total).toBe(3);
    expect(sc.offset).toBe(1);
    expect(sc.count).toBe(2);
    expect(sc.wines).toHaveLength(2);
  });

  it("search-cellar offset beyond the total returns a non-misleading message, not the zero-match one", async () => {
    const r = await call("search-cellar", { offset: 10 });
    const sc = r.structuredContent as { total: number; offset: number; count: number; wines: unknown[] };
    expect(sc.total).toBe(3);
    expect(sc.offset).toBe(10);
    expect(sc.count).toBe(0);
    expect(sc.wines).toHaveLength(0);
    const text = textOf(r);
    expect(text).toContain("offset 10");
    expect(text).not.toContain("No wines found matching your search criteria.");
  });

  it("drinking-recommendations sorts the past-peak wine first with the right status", async () => {
    const r = await call("drinking-recommendations", {});
    const sc = r.structuredContent as {
      recommendations: { iWine: string; status: string; window: string }[];
    };
    expect(sc.recommendations.length).toBe(3);
    // Fixture iWine 101 has Available 1.2 (>1.0 = past peak) → priority tier 0,
    // so it must sort first and carry the past-peak status. A regression that
    // inverts the maturity classification or the sort would fail here.
    expect(sc.recommendations[0].iWine).toBe("101");
    expect(sc.recommendations[0].status).toMatch(/PAST PEAK/);
    expect(sc.recommendations[0].window).toBeTruthy();
  });

  it("cellar-stats totals agree with the text headline", async () => {
    const r = await call("cellar-stats", {});
    const sc = r.structuredContent as { totalBottles: number; uniqueWines: number };
    expect(sc.totalBottles).toBe(11);
    expect(sc.uniqueWines).toBe(3);
    expect(textOf(r)).toContain("Total bottles:  11");
  });

  it("cellar-stats group_by=color carries a structured breakdown", async () => {
    const r = await call("cellar-stats", { group_by: "color" });
    const sc = r.structuredContent as { breakdown?: { dimension: string; rows: { key: string; bottles: number }[] } };
    expect(sc.breakdown?.dimension).toBe("color");
    const totalInBreakdown = sc.breakdown!.rows.reduce((s, row) => s + row.bottles, 0);
    expect(totalInBreakdown).toBe(11);
  });

  it("cellar-stats invalid group_by is flagged isError with the friendly text", async () => {
    const r = await call("cellar-stats", { group_by: "nonsense" });
    // isError lets a structured-output client see the rejection instead of a
    // success-shaped stats payload with the breakdown silently missing.
    expect(r.isError).toBe(true);
    expect(textOf(r)).toContain("Invalid group_by 'nonsense'");
  });

  it("purchase-history spend totals agree with the text", async () => {
    const r = await call("purchase-history", {});
    const sc = r.structuredContent as { totalSpent: number; bottleCount: number; byStore: unknown[] };
    expect(sc.totalSpent).toBe(330);
    expect(sc.bottleCount).toBe(9);
    expect(sc.byStore).toHaveLength(2);
  });

  it("recent-deliveries returns only delivered rows in the window", async () => {
    const r = await call("recent-deliveries", { date_from: "2026-01-01", date_to: "2026-12-31" });
    const sc = r.structuredContent as { total: number; rows: { store?: string }[] };
    expect(sc.total).toBe(1);
    expect(sc.rows[0].store).toBe("K&L");
  });

  it("incoming-orders returns pending rows", async () => {
    const r = await call("incoming-orders", {});
    const sc = r.structuredContent as { total: number; rows: unknown[] };
    expect(sc.total).toBe(2);
    expect(sc.rows).toHaveLength(2);
  });

  it("bottle-details state=all vs cellar agree with the text counts", async () => {
    const all = await call("bottle-details", { state: "all" });
    const scAll = all.structuredContent as { total: number; count: number; offset: number };
    expect(scAll.total).toBe(3);
    expect(scAll.count).toBe(3);
    expect(scAll.offset).toBe(0);

    const cellar = await call("bottle-details", { state: "cellar" });
    const scCellar = cellar.structuredContent as { total: number };
    expect(scCellar.total).toBe(2);
  });

  it("bottle-details paginates with max_results + offset and shows a next-page footer mid-set", async () => {
    const page1 = await call("bottle-details", { state: "all", max_results: 1, offset: 0 });
    const sc1 = page1.structuredContent as { total: number; offset: number; count: number };
    expect(sc1.total).toBe(3);
    expect(sc1.offset).toBe(0);
    expect(sc1.count).toBe(1);
    expect(textOf(page1)).toContain("(Showing 1-1 of 3. Pass offset=1 for the next page.)");

    const page2 = await call("bottle-details", { state: "all", max_results: 1, offset: 1 });
    expect(textOf(page2)).toContain("(Showing 2-2 of 3. Pass offset=2 for the next page.)");

    const page3 = await call("bottle-details", { state: "all", max_results: 1, offset: 2 });
    const sc3 = page3.structuredContent as { total: number; offset: number; count: number };
    expect(sc3.count).toBe(1);
    // Last page — nothing more to show, so no "next page" footer.
    expect(textOf(page3)).not.toMatch(/Pass offset=/);
  });

  it("bottle-details offset beyond the total returns a non-misleading message", async () => {
    const r = await call("bottle-details", { state: "all", offset: 10 });
    const sc = r.structuredContent as { total: number; offset: number; count: number; bottles: unknown[] };
    expect(sc.total).toBe(3);
    expect(sc.offset).toBe(10);
    expect(sc.count).toBe(0);
    const text = textOf(r);
    expect(text).toContain("offset 10");
    expect(text).not.toContain("No bottles found matching your criteria.");
  });

  it("get-wishlist counts only *Wishlist rows", async () => {
    const r = await call("get-wishlist", {});
    const sc = r.structuredContent as { count: number; wines: { wine: string; vintage: string }[] };
    expect(sc.count).toBe(2);
    // NV sentinel normalized in structured output
    expect(sc.wines.some((w) => w.vintage === "NV")).toBe(true);
  });

  it("consumption-history returns structured rows agreeing with the count", async () => {
    const r = await call("consumption-history", {});
    const sc = r.structuredContent as { total: number; count: number; rows: unknown[] };
    expect(sc.total).toBe(2);
    expect(sc.count).toBe(2);
    expect(sc.rows).toHaveLength(2);
  });

  it("consumption-history paginates with max_results + offset", async () => {
    const page1 = await call("consumption-history", { max_results: 1, offset: 0 });
    const sc1 = page1.structuredContent as { total: number; offset: number; count: number };
    expect(sc1.total).toBe(2);
    expect(sc1.offset).toBe(0);
    expect(sc1.count).toBe(1);
    expect(textOf(page1)).toContain("(Showing 1-1 of 2. Pass offset=1 for the next page.)");

    const page2 = await call("consumption-history", { max_results: 1, offset: 1 });
    const sc2 = page2.structuredContent as { total: number; offset: number; count: number };
    expect(sc2.offset).toBe(1);
    expect(sc2.count).toBe(1);
    expect(textOf(page2)).not.toMatch(/Pass offset=/);
  });

  it("consumption-history offset beyond the total returns a non-misleading message", async () => {
    const r = await call("consumption-history", { offset: 10 });
    const sc = r.structuredContent as { total: number; offset: number; count: number };
    expect(sc.total).toBe(2);
    expect(sc.offset).toBe(10);
    expect(sc.count).toBe(0);
    const text = textOf(r);
    expect(text).toContain("offset 10");
    expect(text).not.toContain("No consumption records found matching your criteria.");
  });

  it("tasting-notes returns structured rows agreeing with the count", async () => {
    const r = await call("tasting-notes", {});
    const sc = r.structuredContent as { total: number; count: number };
    expect(sc.total).toBe(2);
    expect(sc.count).toBe(2);
  });

  it("tasting-notes paginates with max_results + offset", async () => {
    const page1 = await call("tasting-notes", { max_results: 1, offset: 0 });
    const sc1 = page1.structuredContent as { total: number; offset: number; count: number };
    expect(sc1.total).toBe(2);
    expect(sc1.offset).toBe(0);
    expect(sc1.count).toBe(1);
    expect(textOf(page1)).toContain("(Showing 1-1 of 2. Pass offset=1 for the next page.)");

    const page2 = await call("tasting-notes", { max_results: 1, offset: 1 });
    expect(textOf(page2)).not.toMatch(/Pass offset=/);
  });

  it("tasting-notes offset beyond the total returns a non-misleading message", async () => {
    const r = await call("tasting-notes", { offset: 10 });
    const sc = r.structuredContent as { total: number; offset: number; count: number };
    expect(sc.total).toBe(2);
    expect(sc.offset).toBe(10);
    expect(sc.count).toBe(0);
    const text = textOf(r);
    expect(text).toContain("offset 10");
    expect(text).not.toContain("No tasting notes found matching your criteria.");
  });
});

describe("structured output — refresh-data (stubbed fetch)", () => {
  const savedEnv: Record<string, string | undefined> = {};
  let tmpDir: string;

  beforeAll(() => {
    for (const k of ["CT_CACHE_DIR", "CT_USERNAME", "CT_PASSWORD"]) savedEnv[k] = process.env[k];
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ct-refresh-"));
    process.env.CT_CACHE_DIR = tmpDir;
    process.env.CT_USERNAME = "test-user";
    process.env.CT_PASSWORD = "test-pass";
    // exportAll fetches all 8 tables; return a valid (non-HTML) CSV for each.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response('"iWine","Wine"\n"1","Test Wine"\n', {
          status: 200,
          headers: { "content-type": "text/csv; charset=utf-8" },
        })
      )
    );
  });

  afterAll(() => {
    vi.unstubAllGlobals();
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns structured table stats for all 8 named tables", async () => {
    const server = createServer();
    const client = new Client({ name: "test-client", version: "0.0.0" });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(ct), server.connect(st)]);
    try {
      const r = await client.callTool({ name: "refresh-data", arguments: {} });
      const sc = r.structuredContent as {
        serverVersion: string;
        tables: { name: string; rows: number; description: string }[];
      };
      expect(new Set(sc.tables.map((t) => t.name))).toEqual(
        new Set(["List", "Notes", "Purchase", "Consumed", "Availability", "Tag", "Bottles", "Pending"])
      );
      // Each stubbed fetch returns a 1-row CSV, so every table reports rows: 1.
      expect(sc.tables.every((t) => t.rows === 1)).toBe(true);
      expect(sc.serverVersion).toBeTruthy();
    } finally {
      await Promise.all([client.close(), server.close()]);
    }
  });
});

describe("structured output — local credential tools", () => {
  const savedEnv: Record<string, string | undefined> = {};
  let tmpDir: string;
  let client: Client;
  let server: ReturnType<typeof createServer>;

  beforeAll(async () => {
    for (const k of ["CT_CACHE_DIR", "CT_USERNAME", "CT_PASSWORD"]) savedEnv[k] = process.env[k];
    // Unset creds so setup-credentials/clear-user-data ARE registered.
    delete process.env.CT_USERNAME;
    delete process.env.CT_PASSWORD;
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ct-clear-"));
    fs.writeFileSync(path.join(tmpDir, "List_latest.csv"), '"iWine"\n"1"\n', "utf-8");
    process.env.CT_CACHE_DIR = tmpDir;

    server = createServer();
    client = new Client({ name: "test-client", version: "0.0.0" });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(ct), server.connect(st)]);
  });

  afterAll(async () => {
    // Restore env + remove the temp dir even if close() rejects, so test creds
    // or the deleted-creds state can't leak into a later describe block.
    try {
      await Promise.all([client.close(), server.close()]);
    } finally {
      for (const [k, v] of Object.entries(savedEnv)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("clear-user-data returns structured cache-removal status (cache only)", async () => {
    const r = await client.callTool({
      name: "clear-user-data",
      arguments: { clear_credentials: false, clear_cache: true },
    });
    const sc = r.structuredContent as { credentials: string; cacheFilesRemoved: number };
    expect(sc.credentials).toBe("not_found");
    expect(sc.cacheFilesRemoved).toBe(1);
  });

  it("setup-credentials rejects malformed input via structured status", async () => {
    // Control-char and over-length inputs are rejected by pure local validation
    // — the handler returns BEFORE any network call or config-file write, so this
    // never touches the real ~/.config (getConfigDir has no sandbox override).
    // All four setup-credentials statuses share the same {status, envOverrideActive}
    // shape, so validating rejected_input proves the outputSchema wiring for the tool.
    const control = await client.callTool({
      name: "setup-credentials",
      arguments: { username: "bad\nuser", password: "pw" },
    });
    const scControl = control.structuredContent as { status: string; envOverrideActive: boolean };
    expect(scControl.status).toBe("rejected_input");
    expect(typeof scControl.envOverrideActive).toBe("boolean");

    const long = await client.callTool({
      name: "setup-credentials",
      arguments: { username: "u".repeat(300), password: "p" },
    });
    const scLong = long.structuredContent as { status: string };
    expect(scLong.status).toBe("rejected_input");
  });
});
