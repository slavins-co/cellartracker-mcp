# Issue #11 — Add Test Suite

## Design Decisions
- **Framework**: vitest — TypeScript-native, ESM support, fast, zero-config for this project
- **Structure**: `src/__tests__/query.test.ts` and `src/__tests__/config.test.ts`
- **parseCsvLine**: Not exported — test indirectly through `parseCsv` (keeps API surface small)
- **Config mocking**: Use vitest `vi.mock` for `fs` and `process.env` manipulation
- **No server.ts tests**: setup-credentials is deeply coupled to MCP server + network calls. The newline rejection and credential validation logic are better tested via config.ts unit tests + manual verification. The issue's "integration test" for setup-credentials is deferred to when we have an MCP test harness.

## Tasks

### 1. Install vitest
- `npm i -D vitest`
- Add `"test": "vitest run"` to package.json scripts

### 2. Write query.test.ts
- parseCsv: basic CSV, quoted fields with commas, escaped quotes, empty fields, trailing commas, header-only, empty input
- toIsoDate: M/D/YYYY → YYYY-MM-DD, passthrough, empty/undefined, malformed
- drinkingPriority: 5-tier sorting (past peak → window closing → in window → approaching → no data)
- spendSummary: totals, date filtering, per-store breakdown, empty input

### 3. Write config.test.ts
- looksLikeTemplate: "${FOO}" → true, "actualvalue" → false, "" → false
- loadEnvFile: basic parsing, comments, quotes, missing file
- getCredentials: env vars, template skip, .env fallback, missing → throws

### 4. CI integration
- Add `npm test` step before build in publish.yml

### 5. Verification
- `npx vitest run` — all tests pass, 0 failures
