# #54 Modernization Design - pre-0.5.0

Decided 2026-07-12: the full MCP surface modernizes before 0.5.0 tags (Brad's call, reversing the plan's earlier "defer to 0.6.0" - appetite demonstrated, and deferral was what kept the zod 4 PR open). Annotations (item 1) already shipped in PR #77. This document is the splitting/design pass #54 required; implementation sessions go straight to work from it.

Key enabling fact (verified 2026-07-12): `@modelcontextprotocol/sdk` 1.29.0 declares `zod: ^3.25 || ^4.0` - zod 4 is officially supported by the installed SDK.

## Pre-work: dependency queue (before slice A)

Merge order (minimizes lockfile rebase churn; dependabot auto-rebases between merges):
1. #59 action-gh-release 3 (workflow-only, no lockfile)
2. #67 @types/node group (trivial)
3. #68 csv-parse 7 (runtime major - the 11 parseCsv unit tests cover the exact options used; one local tool-call smoke after merge)
4. #57 hono transitive (comment `@dependabot rebase` first - CI never ran; hono is the SDK's HTTP transport, unused by this stdio server)
5. #58 vite - CLOSE, stale (lockfile already at 8.1.4)
6. #65 TypeScript 7 - merge WITH dist smoke test: vitest transforms src itself, so CI never validates tsc's emitted output. Smoke = `npm run build`, then a live client against `node dist/index.js` (`tools/list` + one `callTool`).
7. #63 zod 4 - do NOT merge standalone; superseded by slice A (implemented on zod 4). Close with a comment when A merges.

## Slice A - structured output on zod 4 (SHIPPED 2026-07-12, PR #87; #63 closed as superseded)

**Design amendment (ratified in PR #87 review):** invalid `group_by` in cellar-stats returns `isError: true` with the unchanged friendly text - NOT the success-shaped structured stats this document originally specified. Rationale: once clients prefer structuredContent, success-shaped output on rejected input is a silent partial failure; the model reads plausible stats and never learns its argument was refused. Apply the same rule to future input-rejection paths.

Deferred out of slice A (tracked in todo.md): the `toTastingRow` "0.0" sentinel gap (needs a combined text+structured fix, violates byte-identical-text scope) and a shared `listPayload()` helper.

**Migration:** all 13 tool registrations (11 data + 2 conditional credential tools) move from positional `server.tool(name, desc, schema, annotations, cb)` to `registerTool(name, { title, description, inputSchema, outputSchema, annotations }, cb)`. Schemas rewritten once, in zod 4 syntax.

**First commit on the branch:** bump zod to 4.x, run the existing suite (the InMemory `listTools` test exercises zod→JSON-schema conversion). This isolates any zod-4 fallout from the migration diff.

**Dual output, non-breaking:** every handler keeps its existing text content unchanged and adds `structuredContent` validated against `outputSchema`. Token cost of dual output is accepted; slice B (pagination) is the real mitigation for large results.

**Shared shapes (in a new `src/schemas.ts`):**
- `wineRow`: `{ iWine, wine, vintage (label, "NV" normalized), quantity?, location?, bin?, price?, valuation?, color?, country?, region?, varietal?, beginConsume?, endConsume?, scores? (record), url? }` - all optional except iWine/wine/vintage; tools pick fields via `.pick()`/extend.
- Per-tool wrappers:
  - `search-cellar`: `{ total, offset, count, wines: wineRow[] }`
  - `drinking-recommendations`: `{ recommendations: (wineRow & { status, window })[] }`
  - `cellar-stats`: `{ totalBottles, totalValue, uniqueWines, avgPerWine, breakdown?: { dimension, rows: { key, bottles }[] } }`
  - `purchase-history`: `{ totalSpent, bottleCount, avgPrice, byStore: { store, total, count }[], recent: purchaseRow[] }`
  - `recent-deliveries` / `incoming-orders`: `{ total, rows: deliveryRow[] }` (+ most-recent-delivery hint field where applicable)
  - `bottle-details`: `{ total, offset, count, bottles: bottleRow[] }`
  - `get-wishlist`: `{ count, wines: wishlistRow[] }`
  - `consumption-history` / `tasting-notes`: `{ total, offset, count, rows: ...[] }`
  - `refresh-data`: `{ refreshedAt, serverVersion, tables: { name, rows, description }[] }`
  - `setup-credentials`: `{ status: "saved" | "invalid" | "unreachable" | "rejected_input", envOverrideActive }`
  - `clear-user-data`: `{ credentials: "deleted" | "not_found", cacheFilesRemoved }`

**Testing (the load-bearing upgrade):** extend the PR #77 InMemory harness with fixture-cache `callTool` tests - point `CT_CACHE_DIR` at a temp dir seeded with fixture `*_latest.csv` (fresh mtimes) + dummy env creds, so `getFreshPaths` never touches the network. Assert per tool: `structuredContent` validates against the schema, agrees with the text output on counts/key values. This pattern was scoped in the #52 review; here it becomes required, not optional.

## Slice B - pagination (Sonnet, one PR, closes #54-item-3)

- Add `offset` (int, default 0) to the capped list tools: search-cellar, consumption-history, tasting-notes, bottle-details (and any other tool with a result cap).
- Text footer becomes: `(Showing X-Y of Z. Pass offset=Y for the next page.)`
- Structured output already carries `{ total, offset, count }` from slice A.
- No cursors - data is local and stable within a cache window; offset is honest and simpler.

## Slice C - MCP resources (Sonnet, one PR, closes #54-item-4)

- Register one static resource per exported table: `cellartracker://tables/<Table>` (mimeType `text/csv`), 8 tables + any added later, reading the cached `_latest.csv` after the same `ensureFresh` path tools use.
- Optionally one `cellartracker://meta/cache` JSON resource: per-table freshness timestamps, server version.
- Value: bulk/SQL-style analysis without tool-output caps, and it makes the cellartracker-data skill's CSV path first-class in Code (no more hunting cache paths).
- Update the cellartracker-data skill to mention resources as a data source.

## Sequencing

deps (#59→#67→#68→#57, close #58) → #65 + dist smoke → Slice A → Slice B → Slice C → **tag v0.5.0** (release notes: 3 new tools, deep links, hint, structured output, pagination, resources, zod 4/TS 7/csv-parse 7) → bump server.json rides the release (verify-versions covers it).

Deferred, unchanged: #50/#51 (FoodTags, ProReview) to 0.6.0-or-never.

## Open decisions (flagged, not blocking)

1. Slice C in 0.5.0: recommended IN (it is the "full modernization" ask; slice is small). Cut it only if it drags.
2. `bottle-details`/`incoming-orders` deep links: slice A's `wineRow.url` field quietly extends option-1 deep links to structured output everywhere - text stays links-in-two-tools per the #52 decision. Revisit text links only on the usage signal named in that review.
