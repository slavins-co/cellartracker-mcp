/**
 * CellarTracker MCP Server — 6 tools for querying wine cellar data.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { getCacheDir, getCredentials } from "./config.js";
import { TABLES, ensureFresh, exportAll } from "./exporter.js";
import {
  type Row,
  aggregate,
  crossReference,
  drinkingPriority,
  loadTable,
  search,
  spendSummary,
} from "./query.js";

/** Load credentials and ensure cache is fresh. Returns table paths. */
async function getFreshPaths(): Promise<Record<string, string>> {
  const { username, password } = getCredentials();
  const cacheDir = getCacheDir();
  return ensureFresh(username, password, cacheDir);
}

const ALL_SCORE_FIELDS = ["CT", "JR", "WA", "WS", "AG", "WE", "JG", "D", "JH", "VM"];
const KEY_SCORE_FIELDS = ["CT", "WA", "WS", "JR", "AG"];

/** Format score fields from a row into "CT:95, WA:93" style string. */
function formatScores(row: Row, fields: string[] = ALL_SCORE_FIELDS): string {
  const parts: string[] = [];
  for (const field of fields) {
    const val = (row[field] ?? "").trim();
    if (val && val !== "0" && val !== "0.0") {
      parts.push(`${field}:${val}`);
    }
  }
  return parts.length > 0 ? parts.join(", ") : "no scores";
}

/** Format a single wine row into readable text. */
function fmtWine(row: Row, includeScores = false): string {
  const wine = row.Wine ?? row.WineName ?? "Unknown";
  const vintage = row.Vintage ?? "NV";
  const location = row.Location ?? row.Bin ?? "";
  const qty = row.Quantity ?? row.QtyOH ?? "";
  const price = row.Price ?? row.Valuation ?? "";

  const lines = [`  ${vintage} ${wine}`];
  if (location) lines.push(`    Location: ${location}`);
  if (qty) lines.push(`    Qty: ${qty}`);
  if (price) lines.push(`    Price: $${price}`);

  const begin = row.BeginConsume ?? row.BeginDrink ?? "";
  const end = row.EndConsume ?? row.EndDrink ?? "";
  if (begin || end) {
    lines.push(`    Window: ${begin || "?"}-${end || "?"}`);
  }

  if (includeScores) {
    const scores = formatScores(row);
    if (scores !== "no scores") {
      lines.push(`    Scores: ${scores}`);
    }
  }

  return lines.join("\n");
}

/** Return a human-readable maturity status. */
function maturityLabel(row: Row, currentYear: number): string {
  const avail = (row.Available ?? "").trim();
  const end = (row.EndConsume ?? row.EndDrink ?? "").trim();

  if (avail) {
    const a = parseFloat(avail);
    if (!isNaN(a)) {
      if (a > 1.0) return "PAST PEAK — drink now!";
      if (a >= 0.7) return "In window — ready";
      if (a >= 0.3) return "Approaching window";
      return "Young — hold";
    }
  }

  if (end) {
    const endYr = Math.floor(parseFloat(end));
    if (!isNaN(endYr)) {
      if (endYr <= currentYear) return `Window closing (${endYr})`;
      if (endYr <= currentYear + 2) return `Drink soon (by ${endYr})`;
    }
  }

  return "No maturity data";
}

/** Create and configure the MCP server with all 6 tools. */
export function createServer(): McpServer {
  const server = new McpServer({
    name: "cellartracker",
    version: "0.2.0",
  });

  // --- search-cellar ---
  server.tool(
    "search-cellar",
    "Search your wine cellar by name, color, region, varietal, location, or vintage range. " +
      "The region parameter searches across Country, Region, SubRegion, Appellation, and Locale fields. " +
      "Returns matching wines with details. Limited to 25 results.",
    {
      query: z.string().optional().describe("Wine name search term"),
      color: z.string().optional().describe("Filter by color (Red, White, Rosé)"),
      region: z.string().optional().describe("Region, country, or appellation"),
      varietal: z.string().optional().describe("Grape varietal"),
      location: z.string().optional().describe("Storage location"),
      vintage_min: z.number().optional().describe("Minimum vintage year"),
      vintage_max: z.number().optional().describe("Maximum vintage year"),
    },
    async ({ query, color, region, varietal, location, vintage_min, vintage_max }) => {
      const paths = await getFreshPaths();
      const listRows = loadTable(paths.List);

      const filters: Record<string, string | undefined> = {};
      if (query) filters.Wine = query;
      if (color) filters.Color = color;
      if (varietal) filters.Varietal = varietal;
      if (location) filters.Location = location;

      let results = search(listRows, filters);

      // Region searches across all geographic fields
      if (region) {
        const term = region.toLowerCase();
        const geoFields = ["Country", "Region", "SubRegion", "Appellation", "Locale"];
        results = results.filter((row) =>
          geoFields.some((f) => (row[f] ?? "").toLowerCase().includes(term))
        );
      }

      // Apply vintage range filter
      if (vintage_min !== undefined || vintage_max !== undefined) {
        results = results.filter((row) => {
          const v = parseInt(row.Vintage ?? "0", 10);
          if (isNaN(v)) return false;
          if (vintage_min !== undefined && v < vintage_min) return false;
          if (vintage_max !== undefined && v > vintage_max) return false;
          return true;
        });
      }

      // Cross-reference with availability for scores and windows (deferred until after filtering)
      const availRows = loadTable(paths.Availability);
      results = crossReference(results, availRows, "iWine");

      const total = results.length;
      results = results.slice(0, 25);

      if (results.length === 0) {
        return { content: [{ type: "text", text: "No wines found matching your search criteria." }] };
      }

      const lines = [`Found ${total} wine(s) in your cellar:\n`];
      for (const row of results) {
        lines.push(fmtWine(row, true));
        lines.push("");
      }
      if (total > 25) {
        lines.push(`(Showing 25 of ${total} results. Narrow your search for more specific results.)`);
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  // --- drinking-recommendations ---
  server.tool(
    "drinking-recommendations",
    "Get wine drinking recommendations sorted by urgency. " +
      "Prioritizes wines that are past peak, then those with closing windows, " +
      "then wines currently in their drinking window. Optionally filter by color.",
    {
      color: z.string().optional().describe("Filter by color"),
      occasion: z.string().optional().describe("Occasion description"),
      max_results: z.number().optional().describe("Maximum results (default 10)"),
    },
    async ({ color, occasion, max_results }) => {
      const maxResults = max_results ?? 10;
      const paths = await getFreshPaths();
      let listRows = loadTable(paths.List);
      const availRows = loadTable(paths.Availability);

      if (color) {
        listRows = search(listRows, { Color: color });
      }

      const currentYear = new Date().getFullYear();
      let prioritized = drinkingPriority(listRows, availRows, currentYear);
      prioritized = prioritized.slice(0, maxResults);

      if (prioritized.length === 0) {
        return { content: [{ type: "text", text: "No wines found matching your criteria." }] };
      }

      let header = "Drinking Recommendations";
      if (occasion) header += ` — ${occasion}`;
      if (color) header += ` (filtered: ${color})`;

      const lines = [header, "=".repeat(header.length), ""];
      for (let i = 0; i < prioritized.length; i++) {
        const row = prioritized[i];
        const wine = row.Wine ?? row.WineName ?? "Unknown";
        const vintage = row.Vintage ?? "NV";
        const loc = row.Location ?? row.Bin ?? "";
        const status = maturityLabel(row, currentYear);

        const begin = row.BeginConsume ?? row.BeginDrink ?? "";
        const end = row.EndConsume ?? row.EndDrink ?? "";
        const window = begin || end ? `${begin || "?"}-${end || "?"}` : "unknown";

        const scores = formatScores(row, KEY_SCORE_FIELDS);

        lines.push(`${i + 1}. ${vintage} ${wine}`);
        if (loc) lines.push(`   Location: ${loc}`);
        lines.push(`   Status: ${status}`);
        lines.push(`   Window: ${window}`);
        lines.push(`   Scores: ${scores}`);
        lines.push("");
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  // --- cellar-stats ---
  server.tool(
    "cellar-stats",
    "Get cellar statistics: total bottles, value, unique wines, and optional breakdowns. " +
      "Valid group_by options: color, country, region, varietal, location, category.",
    {
      group_by: z.string().optional().describe("Breakdown dimension"),
    },
    async ({ group_by }) => {
      const paths = await getFreshPaths();
      const listRows = loadTable(paths.List);

      const columnMap: Record<string, string> = {
        color: "Color",
        country: "Country",
        region: "Region",
        varietal: "Varietal",
        location: "Location",
        category: "Category",
      };

      let totalBottles = 0;
      let totalValue = 0;
      const winesSeen = new Set<string>();

      for (const row of listRows) {
        const qty = parseInt(row.Quantity ?? row.QtyOH ?? "0", 10) || 0;
        totalBottles += qty;
        const price = parseFloat(row.Price ?? row.Valuation ?? "0") || 0;
        totalValue += price * qty;
        const wineId = row.iWine ?? row.Wine ?? "";
        if (wineId) winesSeen.add(wineId);
      }

      const avgPerWine =
        winesSeen.size > 0 ? totalValue / winesSeen.size : 0;

      const lines = [
        "Cellar Statistics",
        "=".repeat(40),
        `Total bottles:  ${totalBottles.toLocaleString()}`,
        `Total value:    $${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        `Unique wines:   ${winesSeen.size.toLocaleString()}`,
      ];
      if (winesSeen.size > 0) {
        lines.push(
          `Avg per wine:   $${avgPerWine.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        );
      }

      if (group_by) {
        const groupKey = group_by.toLowerCase().trim();
        if (!(groupKey in columnMap)) {
          return {
            content: [
              {
                type: "text",
                text: `Invalid group_by '${group_by}'. Valid options: ${Object.keys(columnMap).join(", ")}`,
              },
            ],
          };
        }
        const col = columnMap[groupKey];
        const counts = aggregate(listRows, col);

        lines.push("");
        lines.push(`Breakdown by ${group_by}:`);
        lines.push("-".repeat(40));
        lines.push(`${"Category".padEnd(30)} ${"Count".padStart(6)}`);
        lines.push("-".repeat(40));
        for (const [category, count] of Object.entries(counts)) {
          lines.push(`${category.padEnd(30)} ${String(count).padStart(6)}`);
        }
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  // --- purchase-history ---
  server.tool(
    "purchase-history",
    "Search purchase history with spending summary. " +
      "Filter by wine name, store, or date range (YYYY-MM-DD format). " +
      "Shows total spent, average price, per-store breakdown, and recent purchases.",
    {
      query: z.string().optional().describe("Wine name search"),
      store: z.string().optional().describe("Store name filter"),
      date_from: z.string().optional().describe("Start date (YYYY-MM-DD)"),
      date_to: z.string().optional().describe("End date (YYYY-MM-DD)"),
    },
    async ({ query, store, date_from, date_to }) => {
      const paths = await getFreshPaths();
      const purchaseRows = loadTable(paths.Purchase);

      const filters: Record<string, string | undefined> = {};
      if (query) filters.Wine = query;
      if (store) filters.StoreName = store;
      const filtered = search(purchaseRows, filters);

      const summary = spendSummary(filtered, date_from, date_to);

      const lines = [
        "Purchase History Summary",
        "=".repeat(40),
        `Total spent:    $${summary.total_spent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        `Bottles:        ${summary.bottle_count.toLocaleString()}`,
        `Avg price:      $${summary.avg_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      ];

      if (Object.keys(summary.by_store).length > 0) {
        lines.push("");
        lines.push("By Store:");
        lines.push("-".repeat(40));
        lines.push(`${"Store".padEnd(25)} ${"Total".padStart(8)} ${"Qty".padStart(5)}`);
        lines.push("-".repeat(40));
        for (const [storeName, info] of Object.entries(summary.by_store)) {
          const name = storeName.slice(0, 25);
          lines.push(
            `${name.padEnd(25)} $${info.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).padStart(7)} ${String(info.count).padStart(5)}`
          );
        }
      }

      if (summary.recent.length > 0) {
        lines.push("");
        lines.push("Recent Purchases:");
        lines.push("-".repeat(40));
        for (const row of summary.recent) {
          const date = row.PurchaseDate ?? "?";
          const wine = row.Wine ?? "Unknown";
          const price = row.Price ?? "?";
          const qty = row.Quantity ?? "1";
          const sn = row.StoreName ?? "";
          lines.push(`  ${date}  ${wine}`);
          lines.push(`    $${price} x${qty}` + (sn ? ` @ ${sn}` : ""));
        }
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  // --- get-wishlist ---
  server.tool(
    "get-wishlist",
    "View your CellarTracker wishlist wines. Optionally search by wine name, region, or varietal.",
    {
      query: z.string().optional().describe("Search term"),
    },
    async ({ query }) => {
      const paths = await getFreshPaths();
      const tagRows = loadTable(paths.Tag);

      let wishlist = tagRows.filter((r) => (r.ListName ?? "") === "*Wishlist");

      if (query) {
        const term = query.toLowerCase();
        wishlist = wishlist.filter((row) => {
          const searchable = [
            row.Wine, row.WineName, row.Region, row.Varietal, row.Country,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return searchable.includes(term);
        });
      }

      if (wishlist.length === 0) {
        const suffix = query ? ` matching '${query}'.` : ".";
        return { content: [{ type: "text", text: `No wishlist wines found${suffix}` }] };
      }

      const lines = [`Wishlist — ${wishlist.length} wine(s):`, ""];
      for (const row of wishlist) {
        const wine = row.Wine ?? row.WineName ?? "Unknown";
        const vintage = row.Vintage ?? "NV";
        const notes = (row.WinesNotes ?? row.Notes ?? "").trim();
        const maxPrice = (row.MaxPrice ?? row.Price ?? "").trim();

        lines.push(`  ${vintage} ${wine}`);
        if (notes) lines.push(`    Notes: ${notes}`);
        if (maxPrice) lines.push(`    Max price: $${maxPrice}`);
        lines.push("");
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  // --- refresh-data ---
  server.tool(
    "refresh-data",
    "Force refresh all CellarTracker data from the server. " +
      "Downloads fresh CSV exports for all 8 tables regardless of cache age.",
    {},
    async () => {
      const { username, password } = getCredentials();
      const cacheDir = getCacheDir();
      const paths = await exportAll(username, password, cacheDir);

      const now = new Date();
      const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;

      const lines = [`Data refreshed at ${timestamp}`, ""];
      for (const [tableName, tablePath] of Object.entries(paths)) {
        const rows = loadTable(tablePath);
        const desc = TABLES[tableName].desc;
        lines.push(`  ${tableName.padEnd(15)} ${String(rows.length).padStart(6)} rows  (${desc})`);
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  return server;
}
