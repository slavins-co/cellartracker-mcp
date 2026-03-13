/**
 * CellarTracker CSV export and cache management.
 */

import fs from "node:fs";
import path from "node:path";

const BASE_URL = "https://www.cellartracker.com/xlquery.asp";

const AUTH_MESSAGE =
  "CellarTracker authentication failed. Verify your CT_USERNAME and CT_PASSWORD are correct.";

/** Typed error for authentication failures — passes through the credential-stripping catch. */
export class AuthError extends Error {
  constructor() {
    super(AUTH_MESSAGE);
    this.name = "AuthError";
  }
}

export const TABLES: Record<
  string,
  { params: Record<string, string>; desc: string }
> = {
  List: { params: { Table: "List", Location: "1" }, desc: "Current cellar inventory" },
  Notes: { params: { Table: "Notes" }, desc: "Tasting notes" },
  Purchase: { params: { Table: "Purchase" }, desc: "Purchase history" },
  Consumed: { params: { Table: "Consumed" }, desc: "Consumed wines" },
  Availability: { params: { Table: "Availability" }, desc: "Drinking windows & pro scores" },
  Tag: { params: { Table: "Tag" }, desc: "Wishlists & custom lists" },
  Bottles: { params: { Table: "Bottles" }, desc: "Individual bottle records" },
  Pending: { params: { Table: "Pending" }, desc: "Pending/in-transit orders" },
};

/**
 * Fetch a single table from CellarTracker as CSV text.
 * Uses windows-1252 decoding (CellarTracker default) and normalizes line endings.
 */
export async function fetchTable(
  user: string,
  password: string,
  extraParams: Record<string, string>
): Promise<string> {
  const params = new URLSearchParams({
    User: user,
    Password: password,
    Format: "csv",
    ...extraParams,
  });
  const url = `${BASE_URL}?${params.toString()}`;

  let buffer: ArrayBuffer;
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(60_000),
      redirect: "error",
    });
    if (response.status === 401 || response.status === 403) {
      throw new AuthError();
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    buffer = await response.arrayBuffer();
  } catch (e) {
    // Preserve typed auth errors; strip all others to avoid leaking
    // credentials embedded in the URL query string via stack trace
    if (e instanceof AuthError) {
      throw e;
    }
    const table = extraParams.Table ?? "unknown";
    const errType = e instanceof Error ? e.constructor.name : "Error";
    throw new Error(
      `Failed to fetch table '${table}' from CellarTracker: ${errType}`
    );
  }

  const text = new TextDecoder("windows-1252").decode(buffer);

  // CellarTracker returns HTML (not CSV) when credentials are wrong, with HTTP 200.
  if (text.trimStart().startsWith("<")) {
    throw new AuthError();
  }

  return text.replace(/\r\n/g, "\n");
}

/** Save CSV text with timestamp and update _latest copy. */
function saveCsv(csvText: string, tableName: string, cacheDir: string): string {
  const now = new Date();
  const timestamp =
    now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, "0") +
    String(now.getDate()).padStart(2, "0") +
    "_" +
    String(now.getHours()).padStart(2, "0") +
    String(now.getMinutes()).padStart(2, "0") +
    String(now.getSeconds()).padStart(2, "0");

  const timestamped = path.join(cacheDir, `${tableName}_${timestamp}.csv`);
  const latest = path.join(cacheDir, `${tableName}_latest.csv`);

  fs.writeFileSync(timestamped, csvText, "utf-8");
  fs.chmodSync(timestamped, 0o600);
  // copyFileSync preserves no metadata — explicitly set permissions
  fs.copyFileSync(timestamped, latest);
  fs.chmodSync(latest, 0o600);
  return latest;
}

/** Remove old timestamped CSVs, keeping the most recent `keep` files. */
function cleanupOld(tableName: string, cacheDir: string, keep = 10): void {
  const pattern = `${tableName}_2`; // Matches timestamped files (start with year)
  let files: string[];
  try {
    files = fs
      .readdirSync(cacheDir)
      .filter((f) => f.startsWith(pattern) && f.endsWith(".csv"))
      .sort()
      .reverse();
  } catch {
    return;
  }
  for (const f of files.slice(keep)) {
    try {
      fs.unlinkSync(path.join(cacheDir, f));
    } catch {
      // Ignore removal errors
    }
  }
}

/** Export a single table from CellarTracker and save to cache. */
export async function exportTable(
  username: string,
  password: string,
  tableName: string,
  cacheDir: string
): Promise<string> {
  if (!(tableName in TABLES)) {
    throw new Error(
      `Unknown table '${tableName}'. Valid: ${Object.keys(TABLES).join(", ")}`
    );
  }

  const csvText = await fetchTable(username, password, TABLES[tableName].params);
  const latestPath = saveCsv(csvText, tableName, cacheDir);
  cleanupOld(tableName, cacheDir);
  return latestPath;
}

/** Export all 8 tables from CellarTracker in parallel. Returns table name → latest path. */
export async function exportAll(
  username: string,
  password: string,
  cacheDir: string
): Promise<Record<string, string>> {
  const tableNames = Object.keys(TABLES);
  const paths = await Promise.all(
    tableNames.map((name) => exportTable(username, password, name, cacheDir))
  );
  const results: Record<string, string> = {};
  for (let i = 0; i < tableNames.length; i++) {
    results[tableNames[i]] = paths[i];
  }
  return results;
}

/** Check the age of the newest _latest.csv in the cache directory. Returns ms or null. */
export function getCacheAge(cacheDir: string): number | null {
  let files: string[];
  try {
    files = fs
      .readdirSync(cacheDir)
      .filter((f) => f.endsWith("_latest.csv"));
  } catch {
    return null;
  }
  if (files.length === 0) return null;

  let newest = 0;
  for (const f of files) {
    const mtime = fs.statSync(path.join(cacheDir, f)).mtimeMs;
    if (mtime > newest) newest = mtime;
  }
  return Date.now() - newest;
}

/** Export all tables only if cache is older than maxAgeHours. */
export async function ensureFresh(
  username: string,
  password: string,
  cacheDir: string,
  maxAgeHours = 24
): Promise<Record<string, string>> {
  const ageMs = getCacheAge(cacheDir);
  if (ageMs === null || ageMs > maxAgeHours * 3600 * 1000) {
    return exportAll(username, password, cacheDir);
  }

  // Cache is fresh — return existing latest paths
  const results: Record<string, string> = {};
  for (const tableName of Object.keys(TABLES)) {
    const latest = path.join(cacheDir, `${tableName}_latest.csv`);
    if (fs.existsSync(latest)) {
      results[tableName] = latest;
    }
  }
  // If any table is missing, re-export everything
  if (Object.keys(results).length < Object.keys(TABLES).length) {
    return exportAll(username, password, cacheDir);
  }
  return results;
}
