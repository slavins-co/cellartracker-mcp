/**
 * Verify that all six version locations agree, and that MCP registry
 * identity fields match. Run via `npm run verify-versions`; wired into
 * prepublishOnly so a mismatch blocks publishing.
 */
import { readFileSync } from "node:fs";

const read = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), "utf8"));

const pkg = read("package.json");
const manifest = read("manifest.json");
const plugin = read(".claude-plugin/plugin.json");
const marketplace = read(".claude-plugin/marketplace.json");
const server = read("server.json");

const versions = {
  "package.json": pkg.version,
  "manifest.json": manifest.version,
  ".claude-plugin/plugin.json": plugin.version,
  ".claude-plugin/marketplace.json (plugins[0])": marketplace.plugins[0].version,
  "server.json": server.version,
  "server.json (packages[0])": server.packages[0].version,
};

const mismatched = Object.entries(versions).filter(([, v]) => v !== pkg.version);
if (mismatched.length > 0) {
  console.error("Version mismatch!", versions);
  process.exit(1);
}

// Registry ownership validation requires these to match exactly.
if (pkg.mcpName !== server.name) {
  console.error(
    `Registry name mismatch! package.json mcpName (${pkg.mcpName}) != server.json name (${server.name})`
  );
  process.exit(1);
}
if (server.packages[0].identifier !== pkg.name) {
  console.error(
    `Package identifier mismatch! server.json packages[0].identifier (${server.packages[0].identifier}) != package.json name (${pkg.name})`
  );
  process.exit(1);
}

console.log("Versions in sync:", pkg.version, "| registry name:", server.name);
