/**
 * CSV query engine for CellarTracker data.
 */

import fs from "node:fs";
import { parse } from "csv-parse/sync";

export type Row = Record<string, string>;

/**
 * Parse CSV text into an array of row objects.
 * Uses csv-parse for robust handling of quoted fields, BOM, and edge cases.
 */
export function parseCsv(text: string): Row[] {
  if (!text.trim()) return [];
  let headers: string[] = [];
  const rows: Row[] = parse(text, {
    columns: (row: string[]) => { headers = row; return row; },
    skip_empty_lines: true,
    relax_column_count: true,
    relax_quotes: true,
    bom: true,
  });

  // Fill missing fields with "" to match prior behavior
  for (const row of rows) {
    for (const h of headers) {
      if (!(h in row)) row[h] = "";
    }
  }
  return rows;
}

/** Load a CSV file into an array of row objects. */
export function loadTable(csvPath: string): Row[] {
  const text = fs.readFileSync(csvPath, "utf-8");
  return parseCsv(text);
}

/**
 * Case-insensitive substring match on column values.
 * Example: search(rows, { Color: "red", Region: "burg" })
 */
export function search(rows: Row[], filters: Record<string, string | undefined>): Row[] {
  const activeFilters = Object.entries(filters).filter(
    ([, v]) => v !== undefined && v !== ""
  ) as [string, string][];
  if (activeFilters.length === 0) return rows;

  return rows.filter((row) =>
    activeFilters.every(([col, term]) =>
      (row[col] ?? "").toLowerCase().includes(term.toLowerCase())
    )
  );
}

/** Count rows grouped by a column value, sorted descending. */
export function aggregate(rows: Row[], groupBy: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const key = (row[groupBy] ?? "").trim() || "(unknown)";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).sort((a, b) => b[1] - a[1])
  );
}

/**
 * Join primary and secondary rows via a shared key field.
 * Builds a lookup from secondary, merges fields into copies of primary rows.
 */
export function crossReference(
  primary: Row[],
  secondary: Row[],
  key = "iWine"
): Row[] {
  const lookup: Record<string, Row> = {};
  for (const row of secondary) {
    const k = row[key] ?? "";
    if (k) lookup[k] = row;
  }

  return primary.map((row) => {
    const combined = { ...row };
    const k = row[key] ?? "";
    if (k && lookup[k]) {
      for (const [col, val] of Object.entries(lookup[k])) {
        if (!combined[col]) combined[col] = val;
      }
    }
    return combined;
  });
}

/**
 * Normalize a date string to YYYY-MM-DD for reliable comparison and sorting.
 * Handles M/D/YYYY (CellarTracker export format) and YYYY-MM-DD (user input).
 * Returns "" for unparseable values so they sort to the end.
 */
export function toIsoDate(value: string | undefined): string {
  if (!value?.trim()) return "";
  const v = value.trim();

  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;

  // M/D/YYYY → YYYY-MM-DD
  const match = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    const [, m, d, y] = match;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  return "";
}

function safeFloat(value: string | undefined, fallback = -1): number {
  if (!value?.trim()) return fallback;
  const n = parseFloat(value.trim());
  return isNaN(n) ? fallback : n;
}

function safeInt(value: string | undefined, fallback = 0): number {
  if (!value?.trim()) return fallback;
  const n = Math.floor(parseFloat(value.trim()));
  return isNaN(n) ? fallback : n;
}

/**
 * Cross-reference List + Availability and sort by drinking urgency.
 *
 * Priority tiers:
 *   1. Available > 1.0 (past peak) — most past-peak first
 *   2. EndConsume <= current_year (window closing) — earliest closing first
 *   3. Available 0.7–1.0 (in window)
 *   4. Available 0.3–0.7 (approaching)
 *   5. No data → end of list
 */
export function drinkingPriority(
  listRows: Row[],
  availRows: Row[],
  currentYear: number
): Row[] {
  const merged = crossReference(listRows, availRows, "iWine");

  function sortKey(row: Row): [number, number, number] {
    const avail = safeFloat(row.Available, -1);
    let endConsume = safeInt(row.EndConsume, 0);
    if (!endConsume) endConsume = safeInt(row.EndDrink, 0);

    if (avail > 1.0) return [0, -avail, endConsume];
    if (endConsume && endConsume <= currentYear) return [1, endConsume, -avail];
    if (avail >= 0.7 && avail <= 1.0) return [2, -avail, endConsume];
    if (avail >= 0.3 && avail < 0.7) return [3, -avail, endConsume];
    return [4, 0, 0];
  }

  merged.sort((a, b) => {
    const ka = sortKey(a);
    const kb = sortKey(b);
    for (let i = 0; i < 3; i++) {
      if (ka[i] !== kb[i]) return ka[i] - kb[i];
    }
    return 0;
  });

  return merged;
}

export interface SpendSummaryResult {
  total_spent: number;
  bottle_count: number;
  avg_price: number;
  by_store: Record<string, { total: number; count: number }>;
  recent: Row[];
}

/**
 * Compute spending summary from purchase rows.
 * Returns: total spent, count, avg price, by_store breakdown, recent 10 purchases.
 */
export function spendSummary(
  purchaseRows: Row[],
  dateFrom?: string,
  dateTo?: string
): SpendSummaryResult {
  let filtered = purchaseRows;
  if (dateFrom) {
    filtered = filtered.filter((r) => toIsoDate(r.PurchaseDate) >= dateFrom);
  }
  if (dateTo) {
    filtered = filtered.filter((r) => toIsoDate(r.PurchaseDate) <= dateTo);
  }

  let total = 0;
  let count = 0;
  const byStore: Record<string, { total: number; count: number }> = {};

  for (const row of filtered) {
    const price = safeFloat(row.Price, 0);
    const qty = safeInt(row.Quantity, 1);
    const lineTotal = price * qty;
    if (price > 0) {
      total += lineTotal;
      count += qty;
      const store = (row.StoreName ?? "").trim() || "(unknown)";
      if (!byStore[store]) byStore[store] = { total: 0, count: 0 };
      byStore[store].total += lineTotal;
      byStore[store].count += qty;
    }
  }

  const avgPrice = count > 0 ? total / count : 0;

  // Recent purchases (last 10 by date)
  const sorted = [...filtered].sort(
    (a, b) => toIsoDate(b.PurchaseDate).localeCompare(toIsoDate(a.PurchaseDate))
  );

  // Round store totals
  const sortedStores = Object.entries(byStore)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([store, info]) => [store, { total: Math.round(info.total * 100) / 100, count: info.count }] as const);

  return {
    total_spent: Math.round(total * 100) / 100,
    bottle_count: count,
    avg_price: Math.round(avgPrice * 100) / 100,
    by_store: Object.fromEntries(sortedStores),
    recent: sorted.slice(0, 10),
  };
}
