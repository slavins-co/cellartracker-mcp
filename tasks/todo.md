# CellarTracker MCP — Todo

## Completed
- [x] #3 — Fix credential persistence after fresh install (PR #3, merged)
- [x] #4 — Add setup-credentials tool for in-chat credential setup (PR #5, merged)
- [x] #7 — Fix unresolved env var templates bypassing saved credentials (PR #8)
- [x] #9 — Add consumption-history and tasting-notes tools (PR #10)

## In Progress
- [ ] #12 — Add .mcpb Desktop Extension for Claude Desktop (PR #13)

## Open
- [ ] Consider adding a `test-credentials` tool for verifying saved credentials without overwriting
- [ ] Submit to Claude Desktop Extensions marketplace (follow-up to #12)
- [x] #34 — Fix: validate credentials before sending to CellarTracker (PR #37)
- [x] #35 — Fix: cellar-stats aggregate counts bottles by Quantity (PR #37)
- [x] #36 — Fix: server.ts reads version from package.json dynamically (PR #37)
- [x] Add diagnostic detail to credential-not-found errors (PR #38)
- [x] #40 — Build staleness: add npm prepare script and rebuild dist (PR #55)
- [x] #42 — Surface server version in refresh-data output (PR #55)
- [x] #41 — Add CI on push/PR, Dependabot config, and SECURITY.md (PR #56)
- [x] Maintainer settings for #41: branch protection on `main` requiring the CI check, Dependabot alerts + security updates, and "Private vulnerability reporting" all enabled
- [x] #43 — Cache freshness: oldest `_latest.csv` mtime, not newest (partial-failure self-heal) (PR #72)
- [x] #44 — Dedupe concurrent cache refreshes with an in-flight promise keyed by cacheDir (PR #72)
- [ ] Follow-up (from #43): `getCacheAge` could filter to known `TABLES` names so a future orphaned `_latest.csv` (table removal/rename) can't pin the cache stale — no current code path creates orphans
- [x] #45 — Auth detection via exact not-logged-in marker; other HTML → ServiceError (PR #73)
- [x] #47 — Retry network errors + 5xx with jittered backoff in fetchTable; tiered timeouts bound worst case (PR #73)
- [x] #46 — Small robustness batch: scoped cache deletion, score rounding, date-parse warning, vintageLabel() extraction (PR #74)
- [x] #48 — Diacritic-insensitive search: foldDiacritics() helper applied to search(), region filter, wishlist filter; extended with a LETTERFORM_FOLDS map (ß→ss, æ/œ/ø) after real-data analysis found ß in 24 fields ("Großes Gewächs") that NFD couldn't fold (PR #75)
- [ ] Follow-up (from #48): LETTERFORM_FOLDS covers the letterforms present/plausible in the current data (German ß + European ligatures). Explicitly deferred: Greek-script producer names (none in data; would need transliteration, not a char map) and other Latin letterforms (ł/đ/þ/ð/ı — absent from data). Extend the map if a real miss surfaces.
- [x] #69 — CI: dry-run the publish packaging path (scripts/pack-check.sh shared by ci.yml + publish.yml) (PR #76)
- [ ] Follow-up (from #69): packaging-dry-run job duplicates npm ci/build from the sibling test job instead of sharing via artifact upload/download. Considered and skipped (disproportionate complexity for CI-minutes saved on a project this size) — revisit if CI minutes become a real constraint.
- [x] #53 — Docs sync: skill tool names (hyphens), missing tools added, stale export-script/charset wording fixed, README wishlist wording corrected (PR #77)
- [x] #54 (partial) — Tool annotations: readOnlyHint/openWorldHint/destructiveHint + titles on all 11 tools via SDK 1.29's tool() overload (PR #77)
- [x] #54 slice A — Structured output: all 13 tools migrated to registerTool with zod-4 outputSchema + dual (text + structuredContent) output; new schemas.ts, Row→structured mappers, fixture-cache InMemory test harness, dist smoke. Supersedes zod-4 PR #63. (PR #87)
- [ ] #54 slice B — Pagination: add `offset` param to search-cellar/consumption-history/tasting-notes/bottle-details; text footer "(Showing X-Y of Z. Pass offset=Y…)". Structured output already carries {total, offset, count} from slice A.
- [ ] #54 slice C — MCP resources: expose cached CSVs as `cellartracker://tables/<Table>` (+ optional meta/cache); update the cellartracker-data skill to mention resources.
- [ ] Follow-up (from #54 slice A): `toTastingRow`'s community-score filter uses exact `!== "0"`, so the `"0.0"` sentinel (per PR #74's two-form sentinel) would leak as `community: "0.0"` — it faithfully mirrors the pre-existing text render (server.ts cScore check), so fixing it means fixing text + structured together in one change; deferred to keep slice A's text byte-identical.
- [ ] Follow-up (from #54 slice A): the structured list-payload tail `{ total, offset:0, count, <key>: results.map(toXRow) }` + its empty twin are hand-written across 4 tools (~9 sites), deepening the already-deferred list-render-tail duplication; a shared `listPayload()` helper would collapse both text and structured tails. Deferred as broad churn on a well-tested uniform migration.
- [ ] Follow-up (from #54/PR #77): `refresh-data`'s `readOnlyHint: true` is debatable — it writes fresh CSVs to the local cache and hits the network, not strictly read-only. Kept per the issue's explicit spec; no MCP client currently gates on the hint. Revisit if client trust-signal behavior starts depending on it.
- [x] #70 — Add `incoming-orders` tool over the `Pending` table (PR #78)
- [x] #71 — `recent-deliveries` hints most-recent delivery date on an empty window (PR #78)
- [x] #49 — Add `bottle-details` tool over the Bottles table (filter by wine/location/bin/size/barcode, state defaults to all); resolved Bottles-vs-Inventory via live pull (Bottles wins — has BottleState, zero extra fetch); extended `cellar-stats` with `group_by=bin` as the location/bin discovery path (PR #79)
- [ ] Follow-up (from #49): the list-render tail (`Found N:` header + `slice(0, max)` + verbatim "(Showing X of Y...)" footer) is now a 4th near-identical copy across search-cellar/consumption-history/tasting-notes/bottle-details, with an already-drifted hardcoded-"25" variant at server.ts search-cellar. A shared `renderResultList()` helper would collapse them — deferred as out of #49's diff scope.
- [x] #52 — Add CellarTracker deep links (`wineUrl()` helper) to search-cellar and drinking-recommendations output; `wine.asp?iWine=<id>` confirmed as the correct pattern via manual browser check (automated WebFetch/headless-browser fetch is WAF-blocked, 202→429) (PR #80)
- [ ] Follow-up (from #52): deep links scoped to search-cellar + drinking-recommendations only, per explicit decision. bottle-details/tasting-notes/consumption-history/purchase-history/recent-deliveries/incoming-orders don't have them yet — extend if a real need surfaces.
