import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { looksLikeTemplate, loadEnvFile, getCredentials } from "../config.js";

// ---------------------------------------------------------------------------
// looksLikeTemplate
// ---------------------------------------------------------------------------
describe("looksLikeTemplate", () => {
  it("detects ${VAR} as a template", () => {
    expect(looksLikeTemplate("${CT_USERNAME}")).toBe(true);
    expect(looksLikeTemplate("${FOO}")).toBe(true);
  });

  it("rejects actual values", () => {
    expect(looksLikeTemplate("myusername")).toBe(false);
    expect(looksLikeTemplate("hunter2")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(looksLikeTemplate("")).toBe(false);
  });

  it("rejects partial template patterns", () => {
    expect(looksLikeTemplate("${")).toBe(false);
    expect(looksLikeTemplate("${}")).toBe(false);
    expect(looksLikeTemplate("prefix${VAR}")).toBe(false);
    expect(looksLikeTemplate("${VAR}suffix")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// loadEnvFile
// ---------------------------------------------------------------------------
describe("loadEnvFile", () => {
  const tmpDir = path.join(os.tmpdir(), "ct-mcp-test-" + process.pid);
  const envPath = path.join(tmpDir, ".env");

  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("parses basic key=value pairs", () => {
    fs.writeFileSync(envPath, "CT_USERNAME=alice\nCT_PASSWORD=secret123\n");
    const env = loadEnvFile(envPath);
    expect(env.CT_USERNAME).toBe("alice");
    expect(env.CT_PASSWORD).toBe("secret123");
  });

  it("skips comments and blank lines", () => {
    fs.writeFileSync(envPath, "# This is a comment\n\nKEY=value\n  \n# another\n");
    const env = loadEnvFile(envPath);
    expect(env).toEqual({ KEY: "value" });
  });

  it("strips surrounding double quotes", () => {
    fs.writeFileSync(envPath, 'KEY="quoted value"\n');
    const env = loadEnvFile(envPath);
    expect(env.KEY).toBe("quoted value");
  });

  it("strips surrounding single quotes", () => {
    fs.writeFileSync(envPath, "KEY='quoted value'\n");
    const env = loadEnvFile(envPath);
    expect(env.KEY).toBe("quoted value");
  });

  it("returns empty object for missing file", () => {
    const env = loadEnvFile("/nonexistent/path/.env");
    expect(env).toEqual({});
  });

  it("handles values containing equals signs", () => {
    fs.writeFileSync(envPath, "KEY=value=with=equals\n");
    const env = loadEnvFile(envPath);
    expect(env.KEY).toBe("value=with=equals");
  });

  it("skips lines without equals sign", () => {
    fs.writeFileSync(envPath, "NOEQUALS\nKEY=value\n");
    const env = loadEnvFile(envPath);
    expect(env).toEqual({ KEY: "value" });
  });
});

// ---------------------------------------------------------------------------
// getCredentials
// ---------------------------------------------------------------------------
describe("getCredentials", () => {
  const originalEnv = { ...process.env };
  const tmpDir = path.join(os.tmpdir(), "ct-mcp-creds-" + process.pid);
  const fakeHome = path.join(tmpDir, "fakehome");

  beforeEach(() => {
    // Clean env
    delete process.env.CT_USERNAME;
    delete process.env.CT_PASSWORD;
    fs.mkdirSync(fakeHome, { recursive: true });
    // Mock homedir so tests never touch real ~/.config/cellartracker-mcp
    vi.spyOn(os, "homedir").mockReturnValue(fakeHome);
    // Mock cwd to the temp dir (no .env by default)
    vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Restore env
    if (originalEnv.CT_USERNAME !== undefined) {
      process.env.CT_USERNAME = originalEnv.CT_USERNAME;
    } else {
      delete process.env.CT_USERNAME;
    }
    if (originalEnv.CT_PASSWORD !== undefined) {
      process.env.CT_PASSWORD = originalEnv.CT_PASSWORD;
    } else {
      delete process.env.CT_PASSWORD;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns env vars when both are set", () => {
    process.env.CT_USERNAME = "envuser";
    process.env.CT_PASSWORD = "envpass";
    const creds = getCredentials();
    expect(creds).toEqual({ username: "envuser", password: "envpass" });
  });

  it("skips env vars that look like unresolved templates", () => {
    process.env.CT_USERNAME = "${CT_USERNAME}";
    process.env.CT_PASSWORD = "${CT_PASSWORD}";

    // Write a config .env in the fake home so it has something to fall back to
    const configDir = path.join(fakeHome, ".config", "cellartracker-mcp");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, ".env"), "CT_USERNAME=fileuser\nCT_PASSWORD=filepass\n");

    const creds = getCredentials();
    expect(creds).toEqual({ username: "fileuser", password: "filepass" });
  });

  it("throws with helpful message when no credentials found", () => {
    // No env vars, no CWD .env, no config-dir .env → should throw
    expect(() => getCredentials()).toThrow("CellarTracker credentials not found");
  });

  it("reads from CWD .env file", () => {
    const cwdEnvPath = path.join(tmpDir, ".env");
    fs.writeFileSync(cwdEnvPath, "CT_USERNAME=cwduser\nCT_PASSWORD=cwdpass\n");

    const creds = getCredentials();
    expect(creds).toEqual({ username: "cwduser", password: "cwdpass" });
  });

  it("falls back to config-dir .env when no env vars or CWD .env", () => {
    const configDir = path.join(fakeHome, ".config", "cellartracker-mcp");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, ".env"), "CT_USERNAME=cfguser\nCT_PASSWORD=cfgpass\n");

    const creds = getCredentials();
    expect(creds).toEqual({ username: "cfguser", password: "cfgpass" });
  });
});
