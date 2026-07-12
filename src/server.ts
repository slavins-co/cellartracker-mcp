/**
 * CellarTracker MCP Server — 13 tools for querying wine cellar data.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import fs from "node:fs";
import { createRequire } from "node:module";

import { clearUserData, getCacheDir, getConfigDir, getCredentials, looksLikeTemplate } from "./config.js";
import { AuthError, TABLES, ensureFresh, exportAll, fetchTable } from "./exporter.js";
import {
  type WineRow,
  type PurchaseRow,
  type BottleRow,
  type WishlistRow,
  type ConsumptionRow,
  type TastingRow,
  type DrinkingRecommendation,
  searchCellarShape,
  drinkingRecommendationsShape,
  cellarStatsShape,
  purchaseHistoryShape,
  recentDeliveriesShape,
  incomingOrdersShape,
  bottleDetailsShape,
  getWishlistShape,
  consumptionHistoryShape,
  tastingNotesShape,
  refreshDataShape,
  setupCredentialsShape,
  clearUserDataShape,
} from "./schemas.js";
import {
  type Row,
  aggregate,
  bottleDetails,
  isInCellar,
  crossReference,
  deliverySummary,
  drinkingPriority,
  foldDiacritics,
  loadTable,
  mostRecentDeliveryDate,
  pendingOrders,
  search,
  spendSummary,
  toIsoDate,
  vintageLabel,
} from "./query.js";

/** Load credentials and ensure cache is fresh. Returns table paths. */
async function getFreshPaths(): Promise<Record<string, string>> {
  const { username, password } = getCredentials();
  const cacheDir = getCacheDir();
  return ensureFresh(username, password, cacheDir);
}

const ALL_SCORE_FIELDS = ["CT", "JR", "WA", "WS", "AG", "WE", "JG", "D", "JH", "VM"];
const KEY_SCORE_FIELDS = ["CT", "WA", "WS", "JR", "AG"];

/** Format score fields from a row into "CT:95, WA:93" style string. Rounds to 1 decimal. */
export function formatScores(row: Row, fields: string[] = ALL_SCORE_FIELDS): string {
  const parts: string[] = [];
  for (const field of fields) {
    const raw = (row[field] ?? "").trim();
    if (!raw) continue;
    const num = parseFloat(raw);
    if (isNaN(num)) {
      parts.push(`${field}:${raw}`);
      continue;
    }
    const rounded = Math.round(num * 10) / 10;
    if (rounded === 0) continue;
    parts.push(`${field}:${rounded}`);
  }
  return parts.length > 0 ? parts.join(", ") : "no scores";
}

/** Build a CellarTracker wine detail page URL from an iWine id. Undefined when iWine is missing/blank. */
export function wineUrl(iWine: string | undefined): string | undefined {
  const id = (iWine ?? "").trim();
  return id ? `https://www.cellartracker.com/wine.asp?iWine=${id}` : undefined;
}

/** Clamp a caller-supplied pagination offset to a valid non-negative integer (default 0). */
export function clampOffset(offset: number | undefined): number {
  return offset && offset > 0 ? Math.floor(offset) : 0;
}

/**
 * Build the "(Showing X-Y of Z. Pass offset=Y for the next page.)" footer for a
 * paginated list, or undefined when the current page reaches the end of the
 * result set (nothing left to page through).
 */
export function paginationFooter(offset: number, shownCount: number, total: number): string | undefined {
  const shownTo = offset + shownCount;
  if (shownTo >= total) return undefined;
  return `(Showing ${offset + 1}-${shownTo} of ${total}. Pass offset=${shownTo} for the next page.)`;
}

/** Trimmed non-empty string, else undefined — for omit-when-absent structured fields. */
function str(v: string | undefined): string | undefined {
  const s = (v ?? "").trim();
  return s ? s : undefined;
}

/** parseFloat that yields undefined for blank/non-finite values. */
function numOrUndef(v: string | undefined): number | undefined {
  const s = (v ?? "").trim();
  if (!s) return undefined;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : undefined;
}

/** parseInt that yields undefined for blank/non-finite values. */
function intOrUndef(v: string | undefined): number | undefined {
  const s = (v ?? "").trim();
  if (!s) return undefined;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Numeric mirror of formatScores: parse each score field, round to 1 decimal,
 * drop the "no score" sentinel (raw 0/0.0 and near-zero values that round to 0)
 * and any non-numeric entry. Returns undefined when nothing survives.
 */
export function scoresRecord(row: Row, fields: string[] = ALL_SCORE_FIELDS): Record<string, number> | undefined {
  const out: Record<string, number> = {};
  for (const field of fields) {
    const raw = (row[field] ?? "").trim();
    if (!raw) continue;
    const num = parseFloat(raw);
    if (isNaN(num)) continue;
    const rounded = Math.round(num * 10) / 10;
    if (rounded === 0) continue;
    out[field] = rounded;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Map a (possibly Availability-joined) List row to the structured WineRow shape.
 * Mirrors fmtWine's field selection; only iWine/wine/vintage are guaranteed,
 * every other field is omitted when the source is blank.
 */
export function toWineRow(row: Row): WineRow {
  const out: WineRow = {
    iWine: (row.iWine ?? "").trim(),
    wine: row.Wine ?? row.WineName ?? "Unknown",
    vintage: vintageLabel(row),
  };
  const quantity = intOrUndef(row.Quantity ?? row.QtyOH);
  if (quantity !== undefined) out.quantity = quantity;
  const location = str(row.Location);
  if (location) out.location = location;
  const bin = str(row.Bin);
  if (bin) out.bin = bin;
  const price = numOrUndef(row.Price);
  if (price !== undefined) out.price = price;
  const valuation = numOrUndef(row.Valuation);
  if (valuation !== undefined) out.valuation = valuation;
  const color = str(row.Color);
  if (color) out.color = color;
  const country = str(row.Country);
  if (country) out.country = country;
  const region = str(row.Region);
  if (region) out.region = region;
  const varietal = str(row.Varietal);
  if (varietal) out.varietal = varietal;
  const beginConsume = str(row.BeginConsume ?? row.BeginDrink);
  if (beginConsume) out.beginConsume = beginConsume;
  const endConsume = str(row.EndConsume ?? row.EndDrink);
  if (endConsume) out.endConsume = endConsume;
  const scores = scoresRecord(row);
  if (scores) out.scores = scores;
  const url = wineUrl(row.iWine);
  if (url) out.url = url;
  return out;
}

/** Map a Purchase/Pending row to the structured PurchaseRow shape. `dateField`
 * selects PurchaseDate vs DeliveryDate; dates are ISO-normalized. */
function toPurchaseRow(row: Row, dateField: string): PurchaseRow {
  const out: PurchaseRow = {
    date: toIsoDate(row[dateField]),
    wine: row.Wine ?? "Unknown",
    vintage: vintageLabel(row),
  };
  const price = numOrUndef(row.Price);
  if (price !== undefined) out.price = price;
  const quantity = intOrUndef(row.Quantity);
  if (quantity !== undefined) out.quantity = quantity;
  const store = str(row.StoreName);
  if (store) out.store = store;
  return out;
}

/** Map a Bottles row to the structured BottleRow shape. */
function toBottleRow(row: Row): BottleRow {
  const out: BottleRow = {
    wine: row.Wine ?? "Unknown",
    vintage: vintageLabel(row),
    state: isInCellar(row) ? "In cellar" : row.BottleState === "0" ? "Consumed" : "Unknown state",
  };
  const barcode = str(row.Barcode);
  if (barcode) out.barcode = barcode;
  const location = str(row.Location);
  if (location) out.location = location;
  const bin = str(row.Bin);
  if (bin) out.bin = bin;
  const size = str(row.BottleSize);
  if (size) out.size = size;
  if (row.BottleState === "0") {
    const consumedDate = toIsoDate(row.ConsumptionDate);
    if (consumedDate) out.consumedDate = consumedDate;
    const consumedType = str(row.ShortType ?? row.ConsumptionType);
    if (consumedType) out.consumedType = consumedType;
  }
  return out;
}

/** Map a Tag (wishlist) row to the structured WishlistRow shape. */
function toWishlistRow(row: Row): WishlistRow {
  const out: WishlistRow = {
    wine: row.Wine ?? row.WineName ?? "Unknown",
    vintage: vintageLabel(row),
  };
  const notes = str(row.WinesNotes ?? row.Notes);
  if (notes) out.notes = notes;
  const maxPrice = str(row.MaxPrice ?? row.Price);
  if (maxPrice) out.maxPrice = maxPrice;
  return out;
}

/** Map a Consumed row to the structured ConsumptionRow shape. */
function toConsumptionRow(row: Row): ConsumptionRow {
  const out: ConsumptionRow = {
    date: toIsoDate(row.Consumed),
    wine: row.Wine ?? "Unknown",
    vintage: vintageLabel(row),
  };
  const type = str(row.ShortType);
  if (type) out.type = type;
  const location = str(row.Location ?? row.Bin);
  if (location) out.location = location;
  const value = str(row.Value ?? row.Price);
  if (value) out.value = value;
  const notes = str(row.ConsumptionNote);
  if (notes) out.notes = notes;
  return out;
}

/** Map a Notes (tasting) row to the structured TastingRow shape. */
function toTastingRow(row: Row): TastingRow {
  const out: TastingRow = {
    date: toIsoDate(row.TastingDate),
    wine: row.Wine ?? "Unknown",
    vintage: vintageLabel(row),
  };
  const rating = str(row.Rating);
  if (rating) out.rating = rating;
  const community = str(row.CScore);
  if (community && community !== "0") out.community = community;
  const event = [row.EventTitle, row.EventLocation].filter(Boolean).join(" — ");
  if (event) out.event = event;
  const notes = str(row.TastingNotes);
  if (notes) out.notes = notes;
  return out;
}

/** Format a single wine row into readable text. */
function fmtWine(row: Row, includeScores = false): string {
  const wine = row.Wine ?? row.WineName ?? "Unknown";
  const vintage = vintageLabel(row);
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

  const link = wineUrl(row.iWine);
  if (link) lines.push(`    Link: ${link}`);

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

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

/** Create and configure the MCP server with all 13 tools. */
export function createServer(): McpServer {
  const server = new McpServer({
    name: "cellartracker",
    version,
  });

  // --- search-cellar ---
  server.registerTool(
    "search-cellar",
    {
      description:
        "Search your wine cellar by name, color, region, varietal, location, or vintage range. " +
        "The region parameter searches across Country, Region, SubRegion, Appellation, and Locale fields. " +
        "Returns matching wines with details, up to 25 per page — pass offset to page through more.",
      inputSchema: {
        query: z.string().optional().describe("Wine name search term"),
        color: z.string().optional().describe("Filter by color (Red, White, Rosé)"),
        region: z.string().optional().describe("Region, country, or appellation"),
        varietal: z.string().optional().describe("Grape varietal"),
        location: z.string().optional().describe("Storage location"),
        vintage_min: z.number().optional().describe("Minimum vintage year"),
        vintage_max: z.number().optional().describe("Maximum vintage year"),
        offset: z.number().optional().describe("Result offset for pagination (default 0)"),
      },
      outputSchema: searchCellarShape,
      annotations: { title: "Search Cellar", readOnlyHint: true, openWorldHint: true },
    },
    async ({ query, color, region, varietal, location, vintage_min, vintage_max, offset }) => {
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
        const term = foldDiacritics(region);
        const geoFields = ["Country", "Region", "SubRegion", "Appellation", "Locale"];
        results = results.filter((row) =>
          geoFields.some((f) => foldDiacritics(row[f] ?? "").includes(term))
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
      const off = clampOffset(offset);
      const shown = results.slice(off, off + 25);

      if (total === 0) {
        return {
          content: [{ type: "text", text: "No wines found matching your search criteria." }],
          structuredContent: { total: 0, offset: off, count: 0, wines: [] },
        };
      }

      if (shown.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No wines at offset ${off} (${total} total match your search). Try a smaller offset.`,
            },
          ],
          structuredContent: { total, offset: off, count: 0, wines: [] },
        };
      }

      const lines = [`Found ${total} wine(s) in your cellar:\n`];
      for (const row of shown) {
        lines.push(fmtWine(row, true));
        lines.push("");
      }
      const footer = paginationFooter(off, shown.length, total);
      if (footer) lines.push(footer);

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        structuredContent: { total, offset: off, count: shown.length, wines: shown.map(toWineRow) },
      };
    }
  );

  // --- drinking-recommendations ---
  server.registerTool(
    "drinking-recommendations",
    {
      description:
        "Get wine drinking recommendations sorted by urgency. " +
        "Prioritizes wines that are past peak, then those with closing windows, " +
        "then wines currently in their drinking window. Optionally filter by color.",
      inputSchema: {
        color: z.string().optional().describe("Filter by color"),
        occasion: z.string().optional().describe("Occasion description"),
        max_results: z.number().optional().describe("Maximum results (default 10)"),
      },
      outputSchema: drinkingRecommendationsShape,
      annotations: { title: "Drinking Recommendations", readOnlyHint: true, openWorldHint: true },
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
        return {
          content: [{ type: "text", text: "No wines found matching your criteria." }],
          structuredContent: { recommendations: [] },
        };
      }

      let header = "Drinking Recommendations";
      if (occasion) header += ` — ${occasion}`;
      if (color) header += ` (filtered: ${color})`;

      const recommendations: DrinkingRecommendation[] = [];
      const lines = [header, "=".repeat(header.length), ""];
      for (let i = 0; i < prioritized.length; i++) {
        const row = prioritized[i];
        const wine = row.Wine ?? row.WineName ?? "Unknown";
        const vintage = vintageLabel(row);
        const loc = row.Location ?? row.Bin ?? "";
        const status = maturityLabel(row, currentYear);

        const begin = row.BeginConsume ?? row.BeginDrink ?? "";
        const end = row.EndConsume ?? row.EndDrink ?? "";
        const window = begin || end ? `${begin || "?"}-${end || "?"}` : "unknown";

        const scores = formatScores(row, KEY_SCORE_FIELDS);

        const link = wineUrl(row.iWine);

        recommendations.push({ ...toWineRow(row), status, window });

        lines.push(`${i + 1}. ${vintage} ${wine}`);
        if (loc) lines.push(`   Location: ${loc}`);
        lines.push(`   Status: ${status}`);
        lines.push(`   Window: ${window}`);
        lines.push(`   Scores: ${scores}`);
        if (link) lines.push(`   Link: ${link}`);
        lines.push("");
      }

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        structuredContent: { recommendations },
      };
    }
  );

  // --- cellar-stats ---
  server.registerTool(
    "cellar-stats",
    {
      description:
        "Get cellar statistics: total bottles, value, unique wines, and optional breakdowns. " +
        "Valid group_by options: color, country, region, varietal, location, bin, category.",
      inputSchema: {
        group_by: z.string().optional().describe("Breakdown dimension"),
      },
      outputSchema: cellarStatsShape,
      annotations: { title: "Cellar Statistics", readOnlyHint: true, openWorldHint: true },
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
        bin: "Bin",
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

      const stats = {
        totalBottles,
        totalValue: Math.round(totalValue * 100) / 100,
        uniqueWines: winesSeen.size,
        avgPerWine: Math.round(avgPerWine * 100) / 100,
      };
      let breakdown: { dimension: string; rows: { key: string; bottles: number }[] } | undefined;

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
          // Invalid input: flag isError so a structured-output client sees the
          // rejection rather than a success-shaped stats payload with the
          // requested breakdown silently missing. The SDK skips outputSchema
          // validation for isError results, so no structuredContent is needed.
          return {
            content: [
              {
                type: "text",
                text: `Invalid group_by '${group_by}'. Valid options: ${Object.keys(columnMap).join(", ")}`,
              },
            ],
            isError: true,
          };
        }
        const col = columnMap[groupKey];
        const counts = aggregate(listRows, col);
        breakdown = {
          dimension: group_by,
          rows: Object.entries(counts).map(([key, bottles]) => ({ key, bottles })),
        };

        lines.push("");
        lines.push(`Breakdown by ${group_by}:`);
        lines.push("-".repeat(40));
        lines.push(`${"Category".padEnd(30)} ${"Count".padStart(6)}`);
        lines.push("-".repeat(40));
        for (const [category, count] of Object.entries(counts)) {
          lines.push(`${category.padEnd(30)} ${String(count).padStart(6)}`);
        }
      }

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        structuredContent: breakdown ? { ...stats, breakdown } : stats,
      };
    }
  );

  // --- purchase-history ---
  server.registerTool(
    "purchase-history",
    {
      description:
        "Search purchase history with spending summary. " +
        "Filter by wine name, store, or date range (YYYY-MM-DD format). " +
        "Shows total spent, average price, per-store breakdown, and recent purchases.",
      inputSchema: {
        query: z.string().optional().describe("Wine name search"),
        store: z.string().optional().describe("Store name filter"),
        date_from: z.string().optional().describe("Start date (YYYY-MM-DD)"),
        date_to: z.string().optional().describe("End date (YYYY-MM-DD)"),
      },
      outputSchema: purchaseHistoryShape,
      annotations: { title: "Purchase History", readOnlyHint: true, openWorldHint: true },
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

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        structuredContent: {
          totalSpent: summary.total_spent,
          bottleCount: summary.bottle_count,
          avgPrice: summary.avg_price,
          byStore: Object.entries(summary.by_store).map(([store, info]) => ({
            store,
            total: info.total,
            count: info.count,
          })),
          recent: summary.recent.map((r) => toPurchaseRow(r, "PurchaseDate")),
        },
      };
    }
  );

  // --- recent-deliveries ---
  server.registerTool(
    "recent-deliveries",
    {
      description:
        "List wines actually delivered (received) in a date range, keyed on " +
        "DeliveryDate. Defaults to the last 30 days. Use this for 'what just " +
        "landed', unlike purchase-history which keys on order date.",
      inputSchema: {
        date_from: z.string().optional().describe("Start delivery date (YYYY-MM-DD). Defaults to 30 days ago."),
        date_to: z.string().optional().describe("End delivery date (YYYY-MM-DD). Defaults to today."),
        store: z.string().optional().describe("Store name filter"),
      },
      outputSchema: recentDeliveriesShape,
      annotations: { title: "Recent Deliveries", readOnlyHint: true, openWorldHint: true },
    },
    async ({ date_from, date_to, store }) => {
      const paths = await getFreshPaths();
      const purchaseRows = loadTable(paths.Purchase);

      const today = new Date();
      const iso = (d: Date) => d.toISOString().slice(0, 10);
      const from = date_from ?? iso(new Date(today.getTime() - 30 * 864e5));
      const to = date_to ?? iso(today);

      const scoped = store ? search(purchaseRows, { StoreName: store }) : purchaseRows;
      const summary = deliverySummary(scoped, from, to);

      const lines = [
        `Deliveries ${summary.date_from} to ${summary.date_to}`,
        "=".repeat(40),
        `Lines: ${summary.line_count}   Bottles: ${summary.bottle_count}`,
        "",
      ];

      const mostRecent =
        summary.deliveries.length === 0 ? mostRecentDeliveryDate(scoped) : "";
      if (summary.deliveries.length === 0) {
        lines.push("No deliveries in this window.");
        if (mostRecent) {
          lines.push(`Most recent delivery was ${mostRecent} — pass date_from to widen the range.`);
        }
      } else {
        for (const r of summary.deliveries) {
          const vint = vintageLabel(r);
          lines.push(`  ${toIsoDate(r.DeliveryDate)}  ${vint} ${r.Wine ?? "Unknown"}`);
          lines.push(`    $${r.Price ?? "?"} x${r.Quantity ?? "1"}` + (r.StoreName ? ` @ ${r.StoreName}` : ""));
        }
      }

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        structuredContent: {
          total: summary.line_count,
          rows: summary.deliveries.map((r) => toPurchaseRow(r, "DeliveryDate")),
          ...(mostRecent ? { mostRecentDelivery: mostRecent } : {}),
        },
      };
    }
  );

  // --- incoming-orders ---
  server.registerTool(
    "incoming-orders",
    {
      description:
        "List wines ordered but not yet received, from the Pending table. " +
        "Sorted oldest order first. Use this for 'what's on the way', unlike " +
        "recent-deliveries which shows what has already arrived.",
      inputSchema: {
        store: z.string().optional().describe("Store name filter"),
      },
      outputSchema: incomingOrdersShape,
      annotations: { title: "Incoming Orders", readOnlyHint: true, openWorldHint: true },
    },
    async ({ store }) => {
      const paths = await getFreshPaths();
      const pendingRows = loadTable(paths.Pending);

      const scoped = store ? search(pendingRows, { StoreName: store }) : pendingRows;
      const summary = pendingOrders(scoped);

      const lines = [
        "Incoming Orders",
        "=".repeat(40),
        `Lines: ${summary.line_count}   Bottles: ${summary.bottle_count}`,
        "",
      ];

      if (summary.orders.length === 0) {
        lines.push("No pending orders.");
      } else {
        for (const r of summary.orders) {
          const vint = vintageLabel(r);
          lines.push(`  ${toIsoDate(r.PurchaseDate)}  ${vint} ${r.Wine ?? "Unknown"}`);
          lines.push(`    $${r.Price ?? "?"} x${r.Quantity ?? "1"}` + (r.StoreName ? ` @ ${r.StoreName}` : ""));
        }
      }

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        structuredContent: {
          total: summary.line_count,
          rows: summary.orders.map((r) => toPurchaseRow(r, "PurchaseDate")),
        },
      };
    }
  );

  // --- bottle-details ---
  server.registerTool(
    "bottle-details",
    {
      description:
        "Look up individual bottles from the Bottles table — the per-bottle view " +
        "spanning both in-cellar and consumed bottles, with barcode, exact " +
        "location/bin, and size. Filter by wine name, location, bin, size, or " +
        "barcode; set state to 'cellar' (default 'all' includes consumed). " +
        "If the user attaches a photo of a bottle or its barcode, read the " +
        "barcode digits from the image and pass them as the barcode filter. " +
        "Location and Bin are account-specific labels, not physical descriptions " +
        "— if a location/bin filter finds nothing, use cellar-stats with " +
        "group_by=location or group_by=bin to see the actual values in use. " +
        "Returns up to max_results per page (default 25) — pass offset to page through more.",
      inputSchema: {
        query: z.string().optional().describe("Wine name search term"),
        location: z.string().optional().describe("Storage location (e.g. 'Wine Fridge')"),
        bin: z.string().optional().describe("Specific bin/position (e.g. 'Drawer 2', '1-3')"),
        size: z.string().optional().describe("Bottle format (e.g. '750ml', '1500ml')"),
        barcode: z.string().optional().describe("Bottle barcode — e.g. read from a photo"),
        state: z
          .enum(["cellar", "consumed", "all"])
          .optional()
          .describe("Which bottles: 'cellar', 'consumed', or 'all' (default)"),
        max_results: z.number().optional().describe("Maximum results (default 25)"),
        offset: z.number().optional().describe("Result offset for pagination (default 0)"),
      },
      outputSchema: bottleDetailsShape,
      annotations: { title: "Bottle Details", readOnlyHint: true, openWorldHint: true },
    },
    async ({ query, location, bin, size, barcode, state, max_results, offset }) => {
      // Guard non-positive max_results (0/negative would corrupt slice(0, n)).
      const maxResults = max_results && max_results > 0 ? max_results : 25;
      const off = clampOffset(offset);
      const paths = await getFreshPaths();
      const bottleRows = loadTable(paths.Bottles);

      const matches = bottleDetails(
        bottleRows,
        { wine: query, location, bin, size, barcode },
        state ?? "all"
      );

      if (matches.length === 0) {
        const emptyResult = { total: 0, offset: off, count: 0, bottles: [] };
        // A location/bin miss deserves a different message: CT Location/Bin are
        // opaque account labels, so name the discovery path. But only when the
        // location/bin value itself matched nothing — if it matches rows on its
        // own and another filter (wine/size/barcode/state) caused the miss,
        // pointing at cellar-stats would misdiagnose a valid label.
        const locationBinMissed =
          (location || bin) &&
          bottleDetails(bottleRows, { location, bin }, "all").length === 0;
        if (locationBinMissed) {
          return {
            content: [
              {
                type: "text",
                text:
                  "No bottles found for that location/bin. CellarTracker's Location and Bin " +
                  "values are account-specific labels, not physical descriptions — call " +
                  "cellar-stats with group_by=location or group_by=bin to see what's actually " +
                  "in use, then retry with the exact value.",
              },
            ],
            structuredContent: emptyResult,
          };
        }
        return {
          content: [{ type: "text", text: "No bottles found matching your criteria." }],
          structuredContent: emptyResult,
        };
      }

      const total = matches.length;
      const shown = matches.slice(off, off + maxResults);

      if (shown.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No bottles at offset ${off} (${total} total match your criteria). Try a smaller offset.`,
            },
          ],
          structuredContent: { total, offset: off, count: 0, bottles: [] },
        };
      }

      const stateLabel = (row: Row): string =>
        isInCellar(row) ? "In cellar" : row.BottleState === "0" ? "Consumed" : "Unknown state";

      const lines = [`Found ${total} bottle(s):\n`];
      for (const row of shown) {
        const vintage = vintageLabel(row);
        const wine = row.Wine ?? "Unknown";
        lines.push(`  ${vintage} ${wine}`);
        lines.push(`    State: ${stateLabel(row)}`);
        if ((row.Barcode ?? "").trim()) lines.push(`    Barcode: ${row.Barcode}`);
        const loc = [row.Location, row.Bin].map((v) => (v ?? "").trim()).filter(Boolean).join(" — ");
        if (loc) lines.push(`    Location: ${loc}`);
        if ((row.BottleSize ?? "").trim()) lines.push(`    Size: ${row.BottleSize}`);
        if (row.BottleState === "0") {
          const consumed = toIsoDate(row.ConsumptionDate);
          const cType = (row.ShortType ?? row.ConsumptionType ?? "").trim();
          if (consumed || cType) {
            lines.push(`    Consumed: ${[consumed, cType].filter(Boolean).join(" — ")}`);
          }
        }
        lines.push("");
      }
      const footer = paginationFooter(off, shown.length, total);
      if (footer) lines.push(footer);

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        structuredContent: { total, offset: off, count: shown.length, bottles: shown.map(toBottleRow) },
      };
    }
  );

  // --- get-wishlist ---
  server.registerTool(
    "get-wishlist",
    {
      description:
        "View your CellarTracker wishlist wines. Optionally search by wine name, region, or varietal.",
      inputSchema: {
        query: z.string().optional().describe("Search term"),
      },
      outputSchema: getWishlistShape,
      annotations: { title: "View Wishlist", readOnlyHint: true, openWorldHint: true },
    },
    async ({ query }) => {
      const paths = await getFreshPaths();
      const tagRows = loadTable(paths.Tag);

      let wishlist = tagRows.filter((r) => (r.ListName ?? "") === "*Wishlist");

      if (query) {
        const term = foldDiacritics(query);
        wishlist = wishlist.filter((row) => {
          const searchable = foldDiacritics(
            [row.Wine, row.WineName, row.Region, row.Varietal, row.Country]
              .filter(Boolean)
              .join(" ")
          );
          return searchable.includes(term);
        });
      }

      if (wishlist.length === 0) {
        const suffix = query ? ` matching '${query}'.` : ".";
        return {
          content: [{ type: "text", text: `No wishlist wines found${suffix}` }],
          structuredContent: { count: 0, wines: [] },
        };
      }

      const lines = [`Wishlist — ${wishlist.length} wine(s):`, ""];
      for (const row of wishlist) {
        const wine = row.Wine ?? row.WineName ?? "Unknown";
        const vintage = vintageLabel(row);
        const notes = (row.WinesNotes ?? row.Notes ?? "").trim();
        const maxPrice = (row.MaxPrice ?? row.Price ?? "").trim();

        lines.push(`  ${vintage} ${wine}`);
        if (notes) lines.push(`    Notes: ${notes}`);
        if (maxPrice) lines.push(`    Max price: $${maxPrice}`);
        lines.push("");
      }

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        structuredContent: { count: wishlist.length, wines: wishlist.map(toWishlistRow) },
      };
    }
  );

  // --- consumption-history ---
  server.registerTool(
    "consumption-history",
    {
      description:
        "Search your consumption history — wines you've opened and drunk. " +
        "Filter by wine name, color, or date range. " +
        "Returns most recent consumptions first with tasting context, up to " +
        "max_results per page (default 25) — pass offset to page through more.",
      inputSchema: {
        query: z.string().optional().describe("Wine name search term"),
        color: z.string().optional().describe("Filter by color (Red, White, Rosé)"),
        date_from: z.string().optional().describe("Start date (YYYY-MM-DD)"),
        date_to: z.string().optional().describe("End date (YYYY-MM-DD)"),
        max_results: z.number().optional().describe("Maximum results (default 25)"),
        offset: z.number().optional().describe("Result offset for pagination (default 0)"),
      },
      outputSchema: consumptionHistoryShape,
      annotations: { title: "Consumption History", readOnlyHint: true, openWorldHint: true },
    },
    async ({ query, color, date_from, date_to, max_results, offset }) => {
      const maxResults = max_results ?? 25;
      const off = clampOffset(offset);
      const paths = await getFreshPaths();
      const consumedRows = loadTable(paths.Consumed);

      const filters: Record<string, string | undefined> = {};
      if (query) filters.Wine = query;
      if (color) filters.Color = color;
      let results = search(consumedRows, filters);

      // Date range filter on Consumed column (M/D/YYYY → YYYY-MM-DD for comparison)
      if (date_from) {
        results = results.filter((r) => toIsoDate(r.Consumed) >= date_from);
      }
      if (date_to) {
        results = results.filter((r) => toIsoDate(r.Consumed) <= date_to);
      }

      // Sort by consumption date descending
      results.sort((a, b) => toIsoDate(b.Consumed).localeCompare(toIsoDate(a.Consumed)));

      const total = results.length;
      const shown = results.slice(off, off + maxResults);

      if (total === 0) {
        return {
          content: [{ type: "text", text: "No consumption records found matching your criteria." }],
          structuredContent: { total: 0, offset: off, count: 0, rows: [] },
        };
      }

      if (shown.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No consumption records at offset ${off} (${total} total match your criteria). Try a smaller offset.`,
            },
          ],
          structuredContent: { total, offset: off, count: 0, rows: [] },
        };
      }

      const lines = [`Found ${total} consumption record(s):\n`];
      for (const row of shown) {
        const vintage = vintageLabel(row);
        const wine = row.Wine ?? "Unknown";
        const date = row.Consumed ?? "?";
        const shortType = (row.ShortType ?? "").trim();
        const notes = (row.ConsumptionNote ?? "").trim();
        const value = row.Value ?? row.Price ?? "";
        const loc = row.Location ?? row.Bin ?? "";

        lines.push(`  ${date}  ${vintage} ${wine}`);
        if (shortType) lines.push(`    Type: ${shortType}`);
        if (loc) lines.push(`    Location: ${loc}`);
        if (value) lines.push(`    Value: $${value}`);
        if (notes) lines.push(`    Notes: ${notes}`);
        lines.push("");
      }
      const footer = paginationFooter(off, shown.length, total);
      if (footer) lines.push(footer);

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        structuredContent: { total, offset: off, count: shown.length, rows: shown.map(toConsumptionRow) },
      };
    }
  );

  // --- tasting-notes ---
  server.registerTool(
    "tasting-notes",
    {
      description:
        "Search your tasting notes and reviews. " +
        "Filter by wine name, color, or minimum rating. " +
        "Returns notes with ratings, scores, and tasting details, up to " +
        "max_results per page (default 25) — pass offset to page through more.",
      inputSchema: {
        query: z.string().optional().describe("Wine name search term"),
        color: z.string().optional().describe("Filter by color (Red, White, Rosé)"),
        min_rating: z.number().optional().describe("Minimum rating filter"),
        max_results: z.number().optional().describe("Maximum results (default 25)"),
        offset: z.number().optional().describe("Result offset for pagination (default 0)"),
      },
      outputSchema: tastingNotesShape,
      annotations: { title: "Tasting Notes", readOnlyHint: true, openWorldHint: true },
    },
    async ({ query, color, min_rating, max_results, offset }) => {
      const maxResults = max_results ?? 25;
      const off = clampOffset(offset);
      const paths = await getFreshPaths();
      const notesRows = loadTable(paths.Notes);

      const filters: Record<string, string | undefined> = {};
      if (query) filters.Wine = query;
      if (color) filters.Color = color;
      let results = search(notesRows, filters);

      // Rating filter
      if (min_rating !== undefined) {
        results = results.filter((r) => {
          const rating = parseFloat(r.Rating ?? "0");
          return !isNaN(rating) && rating >= min_rating;
        });
      }

      // Sort by tasting date descending (M/D/YYYY → YYYY-MM-DD for comparison)
      results.sort((a, b) => toIsoDate(b.TastingDate).localeCompare(toIsoDate(a.TastingDate)));

      const total = results.length;
      const shown = results.slice(off, off + maxResults);

      if (total === 0) {
        return {
          content: [{ type: "text", text: "No tasting notes found matching your criteria." }],
          structuredContent: { total: 0, offset: off, count: 0, rows: [] },
        };
      }

      if (shown.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No tasting notes at offset ${off} (${total} total match your criteria). Try a smaller offset.`,
            },
          ],
          structuredContent: { total, offset: off, count: 0, rows: [] },
        };
      }

      const lines = [`Found ${total} tasting note(s):\n`];
      for (const row of shown) {
        const vintage = vintageLabel(row);
        const wine = row.Wine ?? "Unknown";
        const date = row.TastingDate ?? "?";
        const rating = (row.Rating ?? "").trim();
        const notes = (row.TastingNotes ?? "").trim();
        const cScore = (row.CScore ?? "").trim();
        const event = [row.EventTitle, row.EventLocation].filter(Boolean).join(" — ");

        lines.push(`  ${date}  ${vintage} ${wine}`);
        if (rating) lines.push(`    Rating: ${rating}`);
        if (cScore && cScore !== "0") lines.push(`    Community: ${cScore}`);
        if (event) lines.push(`    Event: ${event}`);
        if (notes) lines.push(`    Notes: ${notes}`);
        lines.push("");
      }
      const footer = paginationFooter(off, shown.length, total);
      if (footer) lines.push(footer);

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        structuredContent: { total, offset: off, count: shown.length, rows: shown.map(toTastingRow) },
      };
    }
  );

  // --- refresh-data ---
  server.registerTool(
    "refresh-data",
    {
      description:
        "Force refresh all CellarTracker data from the server. " +
        "Downloads fresh CSV exports for all 8 tables regardless of cache age.",
      inputSchema: {},
      outputSchema: refreshDataShape,
      annotations: { title: "Refresh Cellar Data", readOnlyHint: true, openWorldHint: true },
    },
    async () => {
      const { username, password } = getCredentials();
      const cacheDir = getCacheDir();
      const paths = await exportAll(username, password, cacheDir);

      const now = new Date();
      const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;

      const lines = [`Data refreshed at ${timestamp}`, ""];
      const tables: { name: string; rows: number; description: string }[] = [];
      for (const [tableName, tablePath] of Object.entries(paths)) {
        const rows = loadTable(tablePath);
        const desc = TABLES[tableName].desc;
        lines.push(`  ${tableName.padEnd(15)} ${String(rows.length).padStart(6)} rows  (${desc})`);
        tables.push({ name: tableName, rows: rows.length, description: desc });
      }
      lines.push("", `Server: cellartracker-mcp v${version}`);

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        structuredContent: { refreshedAt: timestamp, serverVersion: version, tables },
      };
    }
  );

  // --- setup-credentials ---
  // Only register when credentials aren't already provided via env vars.
  // Desktop Extension users get credentials injected automatically via manifest user_config.
  const hasEnvCredentials =
    process.env.CT_USERNAME && process.env.CT_PASSWORD &&
    !looksLikeTemplate(process.env.CT_USERNAME) &&
    !looksLikeTemplate(process.env.CT_PASSWORD);

  if (!hasEnvCredentials) {
    server.registerTool(
      "setup-credentials",
      {
        description:
          "Set up or update your CellarTracker login credentials. " +
          "Validates credentials against CellarTracker before saving. " +
          "Use this if you just installed the plugin or need to change your login.",
        inputSchema: {
          username: z.string().describe("Your CellarTracker username"),
          password: z.string().describe("Your CellarTracker password"),
        },
        outputSchema: setupCredentialsShape,
        annotations: { title: "Set Up Credentials", readOnlyHint: false, openWorldHint: true },
      },
      async ({ username, password }) => {
        const envOverrideActive = Boolean(process.env.CT_USERNAME && process.env.CT_PASSWORD);
        // Validate locally before sending anything to CellarTracker
        if (/[\r\n\0]/.test(username) || /[\r\n\0]/.test(password)) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Credentials must not contain newline or null characters.",
              },
            ],
            structuredContent: { status: "rejected_input" as const, envOverrideActive },
          };
        }

        if (username.length > 256 || password.length > 256) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Credentials must be 256 characters or fewer.",
              },
            ],
            structuredContent: { status: "rejected_input" as const, envOverrideActive },
          };
        }

        // Validate credentials by fetching a small table
        try {
          await fetchTable(username, password, TABLES.List.params);
        } catch (e) {
          if (e instanceof AuthError) {
            return {
              content: [
                {
                  type: "text" as const,
                  text:
                    "Invalid credentials — CellarTracker rejected that username/password combination. " +
                    "Please double-check your cellartracker.com login and try again.",
                },
              ],
              structuredContent: { status: "invalid" as const, envOverrideActive },
            };
          }
          return {
            content: [
              {
                type: "text" as const,
                text:
                  "Could not reach CellarTracker to verify your credentials. " +
                  "Check your network connection and try again.",
              },
            ],
            structuredContent: { status: "unreachable" as const, envOverrideActive },
          };
        }

        // Write config file
        const configDir = getConfigDir();
        fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
        if (process.platform !== "win32") {
          fs.chmodSync(configDir, 0o700);
        }

        // Escape backslashes then double quotes for quoted .env values
        const safeUser = username.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const safePass = password.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const envPath = `${configDir}/.env`;
        fs.writeFileSync(envPath, `CT_USERNAME="${safeUser}"\nCT_PASSWORD="${safePass}"\n`, "utf-8");
        if (process.platform !== "win32") {
          fs.chmodSync(envPath, 0o600);
        }

        // Warn if env vars are set (they take priority over the config file)
        const envWarning =
          process.env.CT_USERNAME && process.env.CT_PASSWORD
            ? "\n\nNote: CT_USERNAME/CT_PASSWORD environment variables are also set and take priority over this config file."
            : "";

        return {
          content: [
            {
              type: "text" as const,
              text:
                `Credentials saved and verified! Your CellarTracker account is now connected.\n\n` +
                `You can start using tools like search-cellar, drinking-recommendations, and cellar-stats right away.${envWarning}`,
            },
          ],
          structuredContent: { status: "saved" as const, envOverrideActive },
        };
      }
    );

    // --- clear-user-data ---
    server.registerTool(
      "clear-user-data",
      {
        description:
          "Remove stored CellarTracker credentials and cached wine data from this machine. " +
          "Use this to fully disconnect your account or free up disk space.",
        inputSchema: {
          clear_credentials: z.boolean().optional().describe("Delete saved credentials (default true)"),
          clear_cache: z.boolean().optional().describe("Delete cached CSV exports (default true)"),
        },
        outputSchema: clearUserDataShape,
        // openWorldHint: false — spec default is true, but this tool is local-only
        annotations: { title: "Clear User Data", readOnlyHint: false, destructiveHint: true, openWorldHint: false },
      },
      async ({ clear_credentials, clear_cache }) => {
        const result = clearUserData({
          credentials: clear_credentials ?? true,
          cache: clear_cache ?? true,
        });

        const parts: string[] = [];
        if (result.credentials === "deleted") {
          parts.push("Credentials file deleted.");
        } else if (result.credentials === "not_found") {
          parts.push(clear_credentials ?? true
            ? "No credentials file found."
            : "Credentials file skipped.");
        }

        if (clear_cache ?? true) {
          parts.push(
            result.cacheFilesRemoved > 0
              ? `Removed ${result.cacheFilesRemoved} cached file${result.cacheFilesRemoved === 1 ? "" : "s"}.`
              : "No cached files found."
          );
        } else {
          parts.push("Cache skipped.");
        }

        return {
          content: [{ type: "text" as const, text: parts.join("\n") }],
          structuredContent: {
            credentials: result.credentials,
            cacheFilesRemoved: result.cacheFilesRemoved,
          },
        };
      }
    );
  }

  return server;
}
