/**
 * CellarTracker CSV export and cache management.
 */

import fs from "node:fs";
import path from "node:path";

const BASE_URL = "https://www.cellartracker.com/xlquery.asp";

const AUTH_MESSAGE =
  "CellarTracker authentication failed. Verify your CT_USERNAME and CT_PASSWORD are correct.";

/** Extract charset from a Content-Type header value, defaulting to windows-1252. */
export function parseCharset(contentType: string | null): string {
  const match = contentType?.match(/charset=([^\s;]+)/i);
  return match?.[1] ?? "windows-1252";
}

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
 * Exact marker CellarTracker embeds in the HTML it returns (HTTP 200) for a
 * not-logged-in session. Matching this — rather than "body looks like HTML" —
 * keeps maintenance/error pages from being misreported as bad credentials.
 * Same string the reference client (mathroule/cellartracker) keys on.
 */
const NOT_LOGGED_IN_MARKER = "You are currently not logged into CellarTracker.";

const SERVICE_MESSAGE =
  "CellarTracker returned an unexpected page. The service may be down; try again later.";

/** Typed error for a non-auth service problem (maintenance/error page or unexpected body). */
export class ServiceError extends Error {
  constructor() {
    super(SERVICE_MESSAGE);
    this.name = "ServiceError";
  }
}

/** Internal marker for transient failures (network/timeout or HTTP 5xx) that are safe to retry. */
class RetryableError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "RetryableError";
  }
}

const MAX_ATTEMPTS = 3; // 1 initial + 2 retries

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Decode a response body using the Content-Type charset, falling back to windows-1252. */
function decodeBody(buffer: ArrayBuffer, contentType: string | null): string {
  const encoding = parseCharset(contentType);
  let decoder: TextDecoder;
  try {
    decoder = new TextDecoder(encoding);
  } catch {
    // Fall back to windows-1252 if the server returns an unrecognized charset
    decoder = new TextDecoder("windows-1252");
  }
  return decoder.decode(buffer);
}

/**
 * A single fetch attempt. Classifies the outcome into typed errors:
 * - AuthError: 401/403, or an HTML body carrying the not-logged-in marker.
 * - ServiceError: any other HTML body (maintenance/error page) on a 2xx.
 * - RetryableError: network/timeout failure, body-read failure, or HTTP 5xx.
 * - plain Error("HTTP <status>"): other 4xx (non-retryable, non-auth).
 * Never includes the request URL (which carries the password) in any message.
 */
async function fetchTableOnce(url: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(60_000),
      redirect: "error",
    });
  } catch (e) {
    // fetch() itself failed (DNS, connection reset, timeout, redirect error).
    // Transient — retry. Use the error's class name only, never its message/URL.
    throw new RetryableError(e instanceof Error ? e.constructor.name : "Error");
  }

  if (response.status === 401 || response.status === 403) {
    throw new AuthError();
  }
  if (response.status >= 500) {
    throw new RetryableError(`HTTP ${response.status}`);
  }
  if (!response.ok) {
    // Other 4xx — not auth, not retryable. Status only, no credentials.
    throw new Error(`HTTP ${response.status}`);
  }

  const contentType = response.headers.get("content-type");
  let buffer: ArrayBuffer;
  try {
    buffer = await response.arrayBuffer();
  } catch (e) {
    throw new RetryableError(e instanceof Error ? e.constructor.name : "Error");
  }
  const text = decodeBody(buffer, contentType);

  // CellarTracker returns HTML (not CSV) both for a not-logged-in session
  // (HTTP 200) and for maintenance/error pages. Only the marker means auth.
  if (text.trimStart().startsWith("<")) {
    if (text.includes(NOT_LOGGED_IN_MARKER)) {
      throw new AuthError();
    }
    throw new ServiceError();
  }

  return text.replace(/\r\n/g, "\n");
}

/**
 * Fetch a single table from CellarTracker as CSV text, retrying transient
 * failures. Retries network errors and HTTP 5xx (2 retries, jittered exponential
 * backoff ~1s then ~3s); never retries AuthError, ServiceError, or 4xx. Decodes
 * using the charset from the Content-Type header, falling back to windows-1252.
 *
 * `opts.baseDelayMs` (default 1000) sets the backoff base; tests pass 0.
 */
export async function fetchTable(
  user: string,
  password: string,
  extraParams: Record<string, string>,
  opts: { baseDelayMs?: number } = {}
): Promise<string> {
  const params = new URLSearchParams({
    User: user,
    Password: password,
    Format: "csv",
    ...extraParams,
  });
  const url = `${BASE_URL}?${params.toString()}`;
  const table = extraParams.Table ?? "unknown";
  const baseDelayMs = opts.baseDelayMs ?? 1000;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fetchTableOnce(url);
    } catch (e) {
      // Auth/service failures are definitive — surface their clean messages as-is.
      if (e instanceof AuthError || e instanceof ServiceError) {
        throw e;
      }
      // Retry transient failures with jittered exponential backoff.
      if (e instanceof RetryableError && attempt < MAX_ATTEMPTS) {
        const delay = baseDelayMs * Math.pow(3, attempt - 1);
        await sleep(delay * (0.85 + Math.random() * 0.3));
        continue;
      }
      // Exhausted retries, or a non-retryable error (4xx). All errors reaching
      // here carry a controlled message (status or class name) — never the URL,
      // so the password embedded in its query string cannot leak.
      const detail = e instanceof Error ? e.message : "unknown error";
      const suffix = e instanceof RetryableError ? ` after ${MAX_ATTEMPTS} attempts` : "";
      throw new Error(
        `Failed to fetch table '${table}' from CellarTracker${suffix}: ${detail}`
      );
    }
  }
  // Unreachable: the loop returns or throws on the final attempt.
  throw new Error(`Failed to fetch table '${table}' from CellarTracker`);
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

/**
 * Check the age of the OLDEST _latest.csv in the cache directory. Returns ms or null.
 *
 * Uses the oldest (not newest) mtime so a partial-failure refresh self-heals: if
 * exportAll writes 7 fresh files before an 8th table's fetch rejects, the stale
 * 8th file keeps the reported age high and the next ensureFresh re-exports,
 * instead of the just-written siblings masking it as "fresh" (issue #43).
 */
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

  let oldest = Infinity;
  for (const f of files) {
    const mtime = fs.statSync(path.join(cacheDir, f)).mtimeMs;
    if (mtime < oldest) oldest = mtime;
  }
  return Date.now() - oldest;
}

/**
 * In-flight refresh promises keyed by cache dir. MCP clients routinely fire tool
 * calls in parallel; without this, N concurrent handlers each trigger their own
 * exportAll (up to 8×N credentialed GETs). Concurrent callers for the same cache
 * dir await one shared refresh; the slot clears on settle so the next call after
 * success or failure starts fresh. Keyed by cacheDir to honor per-instance
 * CT_CACHE_DIR overrides (issue #44).
 */
const inFlightRefreshes = new Map<string, Promise<Record<string, string>>>();

/** exportAll with concurrent-refresh dedup per cache dir. */
function dedupedExportAll(
  username: string,
  password: string,
  cacheDir: string
): Promise<Record<string, string>> {
  const existing = inFlightRefreshes.get(cacheDir);
  if (existing) return existing;

  const refresh = exportAll(username, password, cacheDir).finally(() => {
    inFlightRefreshes.delete(cacheDir);
  });
  inFlightRefreshes.set(cacheDir, refresh);
  return refresh;
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
    return dedupedExportAll(username, password, cacheDir);
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
    return dedupedExportAll(username, password, cacheDir);
  }
  return results;
}
