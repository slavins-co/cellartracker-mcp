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

  beforeEach(() => {
    // Clean env
    delete process.env.CT_USERNAME;
    delete process.env.CT_PASSWORD;
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    // Restore env
    process.env.CT_USERNAME = originalEnv.CT_USERNAME;
    process.env.CT_PASSWORD = originalEnv.CT_PASSWORD;
    if (originalEnv.CT_USERNAME === undefined) delete process.env.CT_USERNAME;
    if (originalEnv.CT_PASSWORD === undefined) delete process.env.CT_PASSWORD;
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

    // Write a config .env so it has something to fall back to
    const configDir = path.join(os.homedir(), ".config", "cellartracker-mcp");
    const configEnvPath = path.join(configDir, ".env");
    const hadConfigEnv = fs.existsSync(configEnvPath);
    let originalContent = "";
    if (hadConfigEnv) {
      originalContent = fs.readFileSync(configEnvPath, "utf-8");
    }

    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(configEnvPath, "CT_USERNAME=fileuser\nCT_PASSWORD=filepass\n");

    try {
      const creds = getCredentials();
      expect(creds).toEqual({ username: "fileuser", password: "filepass" });
    } finally {
      // Restore
      if (hadConfigEnv) {
        fs.writeFileSync(configEnvPath, originalContent);
      } else {
        fs.unlinkSync(configEnvPath);
      }
    }
  });

  it("throws with helpful message when no credentials found", () => {
    // Mock cwd to a temp dir with no .env, and ensure config dir has no .env
    const configDir = path.join(os.homedir(), ".config", "cellartracker-mcp");
    const configEnvPath = path.join(configDir, ".env");
    const hadConfigEnv = fs.existsSync(configEnvPath);
    let originalContent = "";

    if (hadConfigEnv) {
      originalContent = fs.readFileSync(configEnvPath, "utf-8");
      fs.unlinkSync(configEnvPath);
    }

    const originalCwd = process.cwd;
    process.cwd = () => tmpDir;

    try {
      expect(() => getCredentials()).toThrow("CellarTracker credentials not found");
    } finally {
      process.cwd = originalCwd;
      if (hadConfigEnv) {
        fs.writeFileSync(configEnvPath, originalContent);
      }
    }
  });

  it("reads from CWD .env file", () => {
    const cwdEnvPath = path.join(tmpDir, ".env");
    fs.writeFileSync(cwdEnvPath, "CT_USERNAME=cwduser\nCT_PASSWORD=cwdpass\n");

    const originalCwd = process.cwd;
    process.cwd = () => tmpDir;

    try {
      const creds = getCredentials();
      expect(creds).toEqual({ username: "cwduser", password: "cwdpass" });
    } finally {
      process.cwd = originalCwd;
    }
  });
});
