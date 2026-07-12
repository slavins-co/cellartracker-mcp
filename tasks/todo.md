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
- [ ] #54 (remaining) — Structured output (outputSchema/structuredContent, consider registerTool), pagination on search-cellar/consumption-history/tasting-notes, optional CSV-as-resources
- [ ] Follow-up (from #54/PR #77): `refresh-data`'s `readOnlyHint: true` is debatable — it writes fresh CSVs to the local cache and hits the network, not strictly read-only. Kept per the issue's explicit spec; no MCP client currently gates on the hint. Revisit if client trust-signal behavior starts depending on it.
