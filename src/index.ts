#!/usr/bin/env node

/**
 * CellarTracker MCP — entry point.
 *
 * Connects the MCP server to stdio transport (JSON-RPC over stdin/stdout).
 * All diagnostic output goes to stderr; stdout is reserved for the protocol.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createServer } from "./server.js";

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("cellartracker-mcp: server running on stdio");
}

main().catch((err: unknown) => {
  console.error("cellartracker-mcp: fatal error:", err);
  process.exit(1);
});
