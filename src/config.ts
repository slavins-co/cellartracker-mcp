/**
 * Credential and path management for CellarTracker MCP.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Detect unresolved MCP client template strings like "${CT_USERNAME}". */
export function looksLikeTemplate(value: string): boolean {
  return /^\$\{.+\}$/.test(value);
}

/** Parse key=value pairs from a .env file. Skips comments and blank lines. */
export function loadEnvFile(filePath: string): Record<string, string> {
  const env: Record<string, string> = {};
  if (!fs.existsSync(filePath)) return env;

  const text = fs.readFileSync(filePath, "utf-8");
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    if (!line.includes("=")) continue;

    const eqIdx = line.indexOf("=");
    const key = line.slice(0, eqIdx).trim();
    let value = line.slice(eqIdx + 1).trim();

    // Strip surrounding quotes if present
    if (
      value.length >= 2 &&
      value[0] === value[value.length - 1] &&
      (value[0] === '"' || value[0] === "'")
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

/** Return the config directory path: ~/.config/cellartracker-mcp/ */
export function getConfigDir(): string {
  return path.join(os.homedir(), ".config", "cellartracker-mcp");
}

/**
 * Load CellarTracker username and password.
 *
 * Resolution order:
 *   1. CT_USERNAME / CT_PASSWORD environment variables
 *   2. .env file in current working directory
 *   3. ~/.config/cellartracker-mcp/.env
 *   4. Throw with clear error message
 */
export function getCredentials(): { username: string; password: string } {
  // Check env vars first
  const envUser = process.env.CT_USERNAME;
  const envPass = process.env.CT_PASSWORD;
  if (envUser && envPass && !looksLikeTemplate(envUser) && !looksLikeTemplate(envPass)) {
    return { username: envUser, password: envPass };
  }

  // Try .env files in order
  const envPaths = [
    path.join(process.cwd(), ".env"),
    path.join(getConfigDir(), ".env"),
  ];

  for (const envPath of envPaths) {
    const env = loadEnvFile(envPath);
    const username = env.CT_USERNAME;
    const password = env.CT_PASSWORD;
    if (username && password) {
      // Warn if file is group/world-readable (Unix only)
      if (process.platform !== "win32") {
        try {
          const mode = fs.statSync(envPath).mode;
          if (mode & 0o044) {
            console.error(
              `Warning: Credential file ${envPath} is readable by other users. ` +
                `Run: chmod 600 ${envPath}`
            );
          }
        } catch {
          // Ignore stat errors
        }
      }
      return { username, password };
    }
  }

  throw new Error(
    "CellarTracker credentials not found.\n\n" +
      "Use the setup-credentials tool to configure your login, or set CT_USERNAME and CT_PASSWORD via:\n" +
      "  - Environment variables\n" +
      "  - .env file in current directory\n" +
      "  - ~/.config/cellartracker-mcp/.env"
  );
}

/**
 * Return the cache directory for CSV exports.
 *
 * Default: ~/.cache/cellartracker-mcp/exports/
 * Override via CT_CACHE_DIR environment variable.
 */
export function getCacheDir(): string {
  const override = process.env.CT_CACHE_DIR;
  const cacheDir = override
    ? override
    : path.join(os.homedir(), ".cache", "cellartracker-mcp", "exports");

  fs.mkdirSync(cacheDir, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") {
    fs.chmodSync(cacheDir, 0o700);
  }
  return cacheDir;
}
