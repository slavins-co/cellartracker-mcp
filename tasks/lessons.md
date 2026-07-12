# Lessons Learned

## MCP Client Syntax
- MCP clients (Claude Desktop) only support `${VAR}` expansion — NOT `${VAR:-default}` bash syntax. Literal string gets passed as credential value. (PR #3)

## Error Class Patterns
- When the codebase has typed error classes (e.g. `AuthError`), always use `instanceof` checks in catch blocks — never bare `catch {}` that swallows all errors. Conflating auth errors with network errors gives users confusing messages. (PR #5)

## .env File Write/Read Parity
- When writing `.env` files, sanitize values against the parser's assumptions. `loadEnvFile` splits on newlines and first `=`, so values with embedded newlines corrupt the file silently. Validate or quote before writing. (PR #5)

## Env Var Logic Consistency
- Match boolean logic exactly when checking env vars. `getCredentials()` uses AND (both must be set); any warning about env var priority must also use AND, not OR. (PR #5)

## MCP Client Template Expansion
- When `.mcp.json` uses `${VAR}` and the var isn't set, some MCP clients pass the literal string `"${CT_USERNAME}"` (truthy, not empty). Always guard against unresolved template values before trusting `process.env` — a truthy env var is not necessarily a valid value. (PR #8)

## Plugin Version Sync
- `.claude-plugin/plugin.json` version is the authoritative version Claude Code displays post-install — it overrides `marketplace.json`. Must be kept in sync with `package.json` on every version bump. The `marketplace.json` version is only used for the marketplace browse view before install.

## CellarTracker Date Format
- CellarTracker CSV exports use M/D/YYYY date format (e.g., `3/1/2026`). Lexicographic comparison on this format is wrong — `3/1` sorts after `12/31`. Always normalize to YYYY-MM-DD via `toIsoDate()` before any date comparison, filtering, or sorting. This affected `spendSummary()` (pre-existing bug) and the new consumption-history/tasting-notes tools. (PR #10)

## Desktop Extension (.mcpb) Manifest Spec
- `manifest_version` is a string (`"0.3"`), not a number. `author` is an object `{"name": "..."}`, not a string. Server config uses `type`/`entry_point`/`mcp_config` — not bare `command`/`args`. Sensitive fields use `"sensitive": true`, not `"secret": true`. Env vars reference user config via `${user_config.key}` templates. (PR #13)

## Version Sync (Three Files)
- Three files now carry the version: `package.json`, `.claude-plugin/plugin.json`, and `manifest.json`. The `verify-versions` script in `prepublishOnly` catches mismatches before publish. All three must be updated on every version bump. (PR #13)

## .mcpb Bundle Size
- `mcpb pack` includes all of `node_modules` by default. Use `.mcpbignore` to exclude dev artifacts and `npm ci --omit=dev` in CI before packing to keep bundle small. Without this, the bundle ballooned from 3MB to 31MB. (PR #13)

## Falsy Zero Trap in parseInt Fallbacks
- `parseInt(value, 10) || 1` silently converts `0` to `1` because `0` is falsy. When counting quantities, use `|| 0` to match the pattern used elsewhere (e.g., `cellar-stats` headline total). The `|| 1` pattern is only safe when you know zero is never a valid value. This caused `aggregate()` breakdown counts to exceed headline totals for cellars with consumed wines (Quantity=0). (PR #37)

## Build Staleness via npx Local Resolution
- `npx -y cellartracker-mcp` can resolve to a local checkout of this repo instead of the npm registry when the session cwd is inside it (npm's `package-lock.json` records a relative `resolved` path when this happens). If the local `dist/` wasn't rebuilt after a `src/` change, the stale compiled code silently serves — this caused the #35/#37 fix to sit unbuilt for ~4 months. Fix: a `"prepare": "npm run build"` script in `package.json` rebuilds `dist/` on every install path (fresh clone, `npm ci`, and npm's local/file-style resolution), but does NOT catch the case of editing `src/` directly without reinstalling/rebuilding — that's a manual-discipline gap with no automatic trigger point (`npm run build` before trusting local output). (PR #55, issue #40)

## Lockfile Version Can Drift Independently
- `package-lock.json`'s top-level `version` field can go stale relative to `package.json` even when nothing else in the lockfile needs updating — `npm install` doesn't always rewrite it. The existing `verify-versions` script only checks `package.json`/`manifest.json`/`plugin.json`/`marketplace.json`, not `package-lock.json`. Caught by chance while rebuilding `dist/` for #40 (0.2.6 vs 0.3.1). Worth checking `package-lock.json`'s version alongside the others if this becomes a recurring issue. (PR #55)

## Synology Drive Sync Causes Spurious Mode-Only Git Diffs
- Working inside a Synology Drive–synced folder, files can repeatedly show as modified in `git status` with a 644→755 mode-only diff (zero content change) — the sync client appears to re-touch permission bits independently of any edits, and it recurs even after stashing/discarding. `git config core.fileMode false` in the repo stops git from tracking permission bits and ends the noise. Verify via `git diff --raw` (look for `0000000` new-blob placeholders with identical old/new content) before assuming any "modified" file in this repo actually changed.

## server.test.ts Has No Live Tool-Invocation Infrastructure
- `src/__tests__/server.test.ts` tests `server.ts` entirely via static source-text assertions (`fs.readFileSync` + regex/substring checks on the source) — there is no `vi.mock`, no `createServer()` invocation, no mocked `getCredentials`/`exportAll` anywhere in the test suite. When adding a small, single-call-site feature to a tool handler, match this convention (a source-text assertion) rather than building new live-invocation mocking infrastructure — that's a much bigger, precedent-setting change than a one-line feature warrants. Building real tool-invocation tests would be a deliberate, separate decision, not something to introduce incidentally. (PR #55, issue #42)

## npm ci Does Not Validate Root Version Field
- A code-review finder claimed `npm ci` would fail with an `EUSAGE` error because `package-lock.json`'s root `version` (0.2.6) didn't match `package.json`'s (0.3.1) on this branch. Empirically wrong: `npm ci` (v11.9.0) only validates the dependency tree/integrity hashes, not the top-level package version field — it exits 0 cleanly with a stale root version. Verified by actually running `rm -rf node_modules && npm ci` with the mismatch present, not by reasoning about npm's docs. Don't trust a plausible-sounding claim about tool behavior from a review agent without a quick empirical check when it's cheap to run. (Issue #41, PR #56)

## In-Flight Promise Dedup Relies on a Synchronous Prologue
- The concurrent-refresh dedup (`dedupedExportAll` + module-level `inFlightRefreshes` Map) only collapses parallel callers because `ensureFresh`'s prologue is fully synchronous up to the `inFlightRefreshes.set()` — `getCacheAge` (readdirSync/statSync) and the `existsSync` loop never yield. `Promise.all([ensureFresh(), ensureFresh()])` runs caller A through `set()` before caller B's prologue starts, so B joins A's promise. If anyone later inserts an `await` *before* the `dedupedExportAll` call (e.g. an async cache check), the two callers interleave, both miss the Map, and the 8×N stampede silently returns with no test failure unless a concurrency test guards it. Keep the pre-dedup path synchronous, or move the Map set to the first synchronous point. (Issues #43/#44, PR #72)

## Testing exporter fetch paths: stub global.fetch with a real Response
- `exporter.ts` network code (`fetchTable` → `exportAll` → `ensureFresh`) is tested by `vi.stubGlobal("fetch", vi.fn(async () => new Response(csv, { status: 200, headers: { "content-type": "text/csv; charset=utf-8" } })))` over a real `fs.mkdtempSync` temp cache dir — no HTTP, no server-invocation harness. Count `mock.mock.calls`/`toHaveBeenCalledTimes` for concurrency assertions. The CSV body must not start with `<` (else `fetchTable` throws AuthError). Always `vi.unstubAllGlobals()` + `rmSync` the temp dir in `afterEach` (one shared `useTempCacheDir()` helper) so a stubbed fetch can't leak into a later suite. (Issues #43/#44, PR #72)

## fetchTable Retry: Timeout Budget Is a Silent-Regression Trap
- `fetchTable`'s retry (#47) bounds worst-case time via `ATTEMPT_TIMEOUTS_MS = [25_000, 10_000, 10_000]` (sum 45s) + jittered backoff (~4.6s max) ≈ 50s — deliberately under typical MCP client tool timeouts (~60s), so a wedged CellarTracker surfaces our own `ServiceError` instead of a client-side abort mid-retry. The bound is a static property of that array, NOT covered by any test (tests mock fetch to resolve instantly and pass `baseDelayMs: 0`). Bumping a per-attempt timeout, adding an attempt, or raising the backoff base silently re-breaks the AC with a green suite. If you touch retry timing, re-check `sum(ATTEMPT_TIMEOUTS_MS) + maxBackoff < ~55s` by hand. The original single-attempt 60s timeout stacked 3× would have been ~184s. (Issues #45/#47, PR #73)

## fetchTable Error Classification: Marker, Not Any-HTML
- CellarTracker returns HTML (HTTP 200) for BOTH a not-logged-in session and maintenance/error pages. Auth is signalled only by the exact literal `You are currently not logged into CellarTracker.` (what the reference client mathroule/cellartracker keys on) — matching "body starts with `<`" conflates an outage with bad credentials and churns users' passwords. Classify: 401/403 or marker → `AuthError`; other 2xx HTML → `ServiceError` (non-retryable — a maintenance window outlasts a ~4s retry budget); 5xx/network/timeout → retryable; other 4xx → non-retryable. Credential-stripping invariant: only the request URL carries the password, so never put a raw `e.message`/`cause` in a surfaced error — `toRetryable(e)` uses `e.constructor.name` only, and the final wrap uses controlled status/class-name text. (Issues #45/#47, PR #73)

## Filename Allowlists Need the Full Naming Convention, Not Just a Prefix
- Scoping `clearUserData`'s cache deletion to "known table files" with `filename.startsWith('<Table>_') && filename.endsWith('.csv')` looked sufficient but still deletes any coincidentally-named file dropped into a shared `CT_CACHE_DIR` (e.g. `List_report_for_taxes.csv`) — exactly the class of file the change was meant to protect. Caught by code review, not by the original test (which only covered clearly-unrelated extensions like `.txt`/`.json`). When allowlisting files by name, match the exact suffix pattern the writer actually produces (`exporter.ts`'s `saveCsv` writes `<Table>_YYYYMMDD_HHMMSS.csv` / `<Table>_latest.csv`), not just a prefix — and write a test with a same-prefix, wrong-suffix file to prove the tighter match. (Issue #46, PR #74)

## Sentinel Filters Must Run After Any Rounding/Transformation
- `formatScores` filtered CellarTracker's "no score" sentinel (`"0"`/`"0.0"`) by comparing the raw trimmed string before rounding to 1 decimal. A near-zero raw value like `"0.04"` doesn't match either literal string, passes the filter, then rounds down to `0` — displaying as `"CT:0"`, visually identical to the sentinel it's supposed to hide. Not exploitable with CellarTracker's real score schema (verified: scores are the 0/0.0 sentinel or a real score in a normal range, nothing in between), but the general pattern — filtering a sentinel value before a lossy transformation instead of after — is a latent bug shape worth checking for whenever rounding/truncation is added near an existing exact-match filter. (Issue #46, PR #74)

## NFD Normalization Doesn't Fold Standalone Letterforms
- `foldDiacritics()` NFD pass only strips diacritics that have a canonical base-letter + combining-mark decomposition (é→e+´, ô→o+^, ü→u+¨) — it does nothing for standalone Unicode letterforms with no such decomposition: ø, æ, ł, đ, ß, ligatures. A query like "grosses" won't match "Großes Gewächs" (German ß). Resolved by adding a `LETTERFORM_FOLDS` substitution map applied *after* `.toLowerCase()` (so uppercase Œ/Ø/ẞ collapse onto lowercase keys) — closing this needs an explicit map, not a smarter regex. Key lesson on scoping the map: **enumerate the actual data before guessing the character set.** A node script folding every non-ASCII char in the real cache CSVs showed the only live gap was ß (24×); the ø/æ/ł/đ I'd speculated about had zero occurrences, German umlauts + all Spanish/Portuguese accents were already NFD-handled, and there was no Greek script at all. The map ended up ß→ss plus 3 prophylactic European ligatures, not the sprawling list the abstract analysis implied. (Issue #48, PR #75)

## Hoist Per-Query Transformations Out of Per-Row Loops
- `search()`'s diacritic-fold initially called `foldDiacritics(term)` inside the `rows.filter(row => activeFilters.every(...))` nested callback — re-running the NFD-normalize + regex-strip on the same search term for every row (N-rows × K-filters calls) instead of once per active filter before the row loop. Caught by code review; server.ts's region/wishlist filters already had the correct pattern (fold the term once, reuse inside the loop) for comparison. When adding any per-value transformation (fold, normalize, parse) to a filter, check whether the transformed value only depends on the query input — if so, hoist it outside the loop over the data. (Issue #48, PR #75)

## npx Silently Ignores devDependency Version Pins When the Package Isn't Installed
- `npx <pkg> <args>` resolves from local `node_modules` first, but if the package isn't there (e.g. stripped by `npm ci --omit=dev` when it's a devDependency, as `@anthropic-ai/mcpb` is), npx falls back to fetching whatever "latest" is from the npm registry — silently ignoring the version range declared in `package.json`. This was already true in the original `publish.yml` (`npx @anthropic-ai/mcpb pack .` after the `--omit=dev` reinstall), just exercised once per release; adding a CI job that runs the same sequence on every push/PR (#69) meaningfully raised the exposure. Fix: read the pinned version from `package.json` and pass it explicitly — `npx --package="@anthropic-ai/mcpb@${VERSION}" mcpb pack .` — rather than relying on npx's implicit resolution. Applies to any `npx`-invoked devDependency after a production-only reinstall. (Issue #69, PR #76)

## .mcpbignore Needs a New Entry Every Time a Top-Level Dev Directory Is Added
- Adding `scripts/pack-check.sh` to the repo silently shipped it inside the packed `.mcpb` — `.mcpbignore` excludes every other dev-only top-level directory (`/src/`, `/.github/`, `/.claude/`, `/tasks/`, `/docs/`, etc.) individually by name, so a new one isn't covered unless someone remembers to add it. Caught only by actually running `mcpb pack .` and inspecting the archive with `unzip -l` — the pack command itself succeeds silently either way. When adding a new top-level directory that isn't meant to ship (scripts, tooling, fixtures), add it to `.mcpbignore` in the same commit and verify with `unzip -l` on the packed output, don't just trust that "not in `files`" or "obviously dev-only" is enough — `.mcpbignore` is its own independent exclude list from `package.json`'s `files` field. (Issue #69, PR #76)
