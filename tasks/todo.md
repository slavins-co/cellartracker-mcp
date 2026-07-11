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
