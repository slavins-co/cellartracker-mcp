# Audit Implementation Plan - 2026-07-11

Source: full audit in the vault at `_System/Audits/2026-07-11-CellarTracker-MCP-Audit.md`. All code findings are filed as GitHub issues (#40-#54, plus post-#39 follow-ups #69-#71), each self-contained for implementation in a fresh session (`/implement <issue>`). This plan sequences them and records the strategic decisions.

Status 2026-07-11 EOD: Phase 1 complete - #40/#41/#42 closed, PR #39 merged (HOLD), v0.3.2 released to npm + .mcpb. Session recap: vault `1-Stream/Session-Recaps/2026-07-11-cellartracker-external-pr-and-v032-release.md`.

## Decisions

**Read-only: CONFIRMED (2026-07-11).** The server stays read-only. Rationale: CellarTracker has no sanctioned write path - exports are explicitly one-way, the private partner API is closed, and the only project that writes back (RoarKri/mcp-cellartracker) scrapes the authenticated web app and carries WAF-detection code because it breaks. With full-account credentials, a write bug corrupts real cellar data; read-only caps the blast radius at disclosure. Deep links (#52) are the read-only-compatible answer to "let me act on a recommendation."

**MCP registry submission: gate on 0.4.0 (decided 2026-07-11).** Submit after 0.4.0 tags - that release changes what a new user hits (stampede fix, diacritic search, honest auth errors). Not 0.5.0: Phase 3 features don't change the trust story, so waiting further is drift. Pros/cons record below.

## Phase 1 - Hygiene (SHIPPED as v0.3.2, 2026-07-11)

Order matters: #40 first (it fixes the class of defect that makes everything else unverifiable on this machine).

| # | Issue | Size |
|---|---|---|
| [#40](https://github.com/slavins-co/cellartracker-mcp/issues/40) | Build staleness: `prepare` script + rebuild dist | S |
| [#41](https://github.com/slavins-co/cellartracker-mcp/issues/41) | CI on push/PR, Dependabot config, SECURITY.md | S |
| [#42](https://github.com/slavins-co/cellartracker-mcp/issues/42) | Version string in refresh-data output | XS |
| - | **Review PR #39** (recent-deliveries over `Purchase`.Delivered, external contributor) - after #41 so CI runs on it | S |

Maintainer-only actions (settings/accounts, not code sessions):
- [ ] Enable branch protection on main requiring the new CI check (after #41).
- [ ] Enable Dependabot alerts + security updates in repo settings.
- [ ] Deprecate PyPI `cellartracker-mcp` 0.1.0 with a pointer to npm (needs PyPI account).
- [ ] One manual read of CellarTracker ToS re: automated access (their terms page 403s automated fetches).

## Phase 2 - Robustness (ship as 0.4.0)

All independent; any order. #43 and #47 both touch exporter.ts error paths - do #43 before #47 if running back-to-back.

| # | Issue | Size |
|---|---|---|
| [#43](https://github.com/slavins-co/cellartracker-mcp/issues/43) | Cache freshness: oldest mtime, not newest (partial-failure staleness) | S |
| [#44](https://github.com/slavins-co/cellartracker-mcp/issues/44) | In-flight refresh dedup (concurrent tool-call stampede) | S |
| [#45](https://github.com/slavins-co/cellartracker-mcp/issues/45) | Auth detection via exact not-logged-in marker | S |
| [#46](https://github.com/slavins-co/cellartracker-mcp/issues/46) | Small batch: scoped cache deletion, score rounding, date-parse warning | S |
| [#47](https://github.com/slavins-co/cellartracker-mcp/issues/47) | Retry with backoff in fetchTable | M |
| [#48](https://github.com/slavins-co/cellartracker-mcp/issues/48) | Diacritic-insensitive search (live-confirmed false negatives) | S |
| [#69](https://github.com/slavins-co/cellartracker-mcp/issues/69) | CI: dry-run publish packaging path (`--omit=dev` + mcpb pack) on PRs | S |

#69 was added post-Phase-1: the `prepare`/`--omit=dev` collision only surfaced mid-release (first v0.3.2 attempt failed). It must land **before the 0.4.0 tag** - its whole point is catching packaging breaks before release day.

## Phase 3 - Features (0.4.x / 0.5.0)

| # | Issue | Size | Sequencing |
|---|---|---|---|
| [#49](https://github.com/slavins-co/cellartracker-mcp/issues/49) | Bottle-level tool (Bottles table, already fetched) | M | After PR #39 merges |
| [#50](https://github.com/slavins-co/cellartracker-mcp/issues/50) | Food-pairing tool (FoodTags table, new fetch) | M | - |
| [#51](https://github.com/slavins-co/cellartracker-mcp/issues/51) | Pro-reviews tool (ProReview table, new fetch) | M | Low value unless user enters pro reviews |
| [#52](https://github.com/slavins-co/cellartracker-mcp/issues/52) | CellarTracker deep links (iWine) in output | S | Verify URL pattern first |
| [#53](https://github.com/slavins-co/cellartracker-mcp/issues/53) | Docs sync (skill drift, README wishlist claim, + recent-deliveries) | S | Any time; cheap |
| [#70](https://github.com/slavins-co/cellartracker-mcp/issues/70) | "Incoming orders" tool over Pending table (what's coming, vs recent-deliveries' what landed) | S | Pairs with #71 |
| [#71](https://github.com/slavins-co/cellartracker-mcp/issues/71) | recent-deliveries: hint most-recent delivery when default window is empty | XS | Pairs with #70 |

Explicitly deferred: PrivateNotes table (privacy-sensitive name; only with explicit opt-in), paid enrichment APIs (Wine-Searcher ~$250/mo not justified for personal use; revisit only if the purchase-evaluator workflow needs live market pricing).

## Phase 4 - Backlog

| # | Issue | Note |
|---|---|---|
| [#54](https://github.com/slavins-co/cellartracker-mcp/issues/54) | MCP modernization: annotations, structuredContent, pagination, resources | Split before implementing; pull annotations forward into any 0.4.x |

## MCP Registry submission - pros/cons

Context: the server is not in the official MCP registry (registry.modelcontextprotocol.io). PulseMCP is mirroring it and explicitly states it is doing so "until the original maintainer publishes it to the official registry." Glama lists it with a "cannot currently be installed" flag.

**Pros**
- Discoverability where it counts: the official registry feeds client directories and the aggregators; today the ~200/mo npm downloads arrive despite zero registry presence.
- Control of presentation: right now third parties (PulseMCP, Glama) define how the server appears, including Glama's unexplained "cannot be installed" flag. A canonical entry replaces their guesses with maintainer-owned metadata.
- Legitimacy for a credential-handling server: official listing + npm provenance is the right trust chain for something that asks for a password.
- Low cost: `mcp-publisher` CLI with GitHub auth, one `server.json`. Free, delistable, no lock-in.
- Timing synergy: annotations (#54) and the hygiene batch make the listing look as good as the code is.

**Cons**
- Invites users, and users invite maintenance: more installs means more issue reports on a project that had a brilliant March sprint and then four quiet months. An unmaintained registry listing ages worse than no listing. This is the real cost.
- A fourth version location: `server.json` joins package.json / plugin.json / manifest.json in the version-sync dance (verify-versions needs extending; the existing script makes this cheap but nonzero).
- Registry churn: schema and moderation policies are still evolving; occasional upkeep PRs.
- Sequencing risk if rushed: listing before CI-on-PR exists (#41) would grow the user base of a credential-handling server while the contribution pipeline has no safety net.

**Recommendation (accepted 2026-07-11): submit after 0.4.0 tags.** Before submitting: pull the `readOnlyHint` annotations forward out of #54 (they strengthen the listing directly), and spend ten minutes on Glama's "cannot be installed" flag so aggregators mirror something that works. The one-time cost is an hour; the recurring cost is honestly answering whether the maintenance appetite exists. If the answer is no, PulseMCP's mirror is an acceptable steady state and this becomes a conscious pass, not a default.

## Execution: PR groupings, models, session order

18 issues consolidate to 11 PRs. The pairs share code paths or domain - separate PRs would rebase over each other. Combined pairs: one session, one branch, PR body closes both issues (`closes #43, closes #44` - same precedent as PR #37, which closed #34-36).

**Model rule:** Sonnet for anything with a checklist; Opus where the issue defines the outcome but the mechanism has room for a wrong-but-plausible design. New issues #69/#70/#71 are all checklist-shaped: Sonnet.

**Plan-review rule:** straight to `/implement` for #40-#48, #51-#53, #69-#71 (issue bodies are implement-ready and the pipeline adds conformity check, TDD, code-review, security-review). Plan-review first for #49 (Bottles vs Inventory choice, tool UX), #50 (unknown FoodTags schema, tool design), and #54 (explicitly needs splitting).

| Order | PR / action | Issues | Model | Notes |
|---|---|---|---|---|
| 1 | Build staleness | #40 + #42 | Sonnet | `prepare` script prevents stale builds; version line in refresh-data makes future staleness visible. #40's optional verify-versions dist check: **consciously skipped** (2026-07-11) - a manual check only protects the dev who remembers to run it, and Synology Drive mtime churn makes it false-positive prone. Do not resurrect. |
| 2 | CI + hygiene | #41 | Sonnet | Own PR so the workflow validates itself on the PR that adds it. Then: branch protection requiring the check, enable Dependabot alerts. |
| 3 | PR #39 review | - | Opus | **Reviewed 2026-07-11 (HOLD).** Holding comment posted 07-11 (done). **Table correction:** it queries the `Purchase` table (`Delivered=True` rows by `DeliveryDate`), *not* Pending - the contributor's choice is correct. The M/D/YYYY date trap and the `Delivered="True"` (capital-T) casing are both already handled (`toIsoDate` + `.toLowerCase()`) - verified against live data. `maintainerCanModify=true`, so push two fixups to `patch-1`: harden a test fixture `"true"`→`"True"` (locks case-insensitivity), fix cosmetic indent/whitespace. Vintage `1001`→`NV` kept (see #46). Merge (merge-commit or squash preserving contributor authorship) after CI goes green - branch predates the workflow so `statusCheckRollup` is empty until the branch is updated. Do NOT run `/implement` on it (that re-forks the work and erases authorship). |
| - | **Release 0.3.2** | | | Publish workflow handles npm + .mcpb. |
| 4 | Refresh reliability | #43 + #44 | Opus | Interacting behaviors: dedup changes who observes a partial-failure refresh. |
| 5 | Fetch resilience | #45 + #47 | Opus | One rewrite of `fetchTable`: retry logic depends on #45's error classification (never retry AuthError). |
| 6 | Small batch | #46 | Sonnet | Independent trio, batched by design. **Add a 4th item (decided in #39 review, 2026-07-11):** extract `vintageLabel(row)` (`1001`/empty → `NV`) into query.ts and propagate to all tools. PR #39 introduced the correct handling; the other 5 tools render raw `1001` via `row.Vintage ?? "NV"`, which never fires for the string `"1001"`. |
| 7 | Diacritic search | #48 | Sonnet | Self-contained matching helper + three call sites. recent-deliveries' store filter routes through `search()`, so it inherits the fix - no extra call site. |
| 8 | Publish dry-run CI | #69 | Sonnet | Must land **before the tag** - release-only workflows hide their bugs until release day (the `prepare`/`--omit=dev` collision proved it on the first v0.3.2 attempt). |
| - | **Release 0.4.0** | | | |
| - | **Registry submission** | | | Gate reached. Pull `readOnlyHint` forward from #54; check Glama's install flag first. |
| 9 | Docs sync | #53 | Sonnet | Do FIRST in Phase 3 - #49/#50/#51 touch the same skill docs; fix drift before adding to them. Scope includes recent-deliveries (see issue comment). |
| 10 | Orders & deliveries | #70 + #71 | Sonnet | Same domain (Pending/deliveries), same server.ts neighborhood, both small. #70 reuses recent-deliveries' conventions. |
| 11 | Bottles tool | #49 | Opus | Plan-review first (Bottles vs Inventory, tool UX). PR #39 dependency: cleared (merged 2026-07-11). |
| 12 | New tables | #50 + #51 | Opus | Plan-review #50 (schema discovery on first authenticated pull); #51 rides the established pattern. |
| 13 | Deep links | #52 | Sonnet | Verify wine-page URL pattern before implementing. |
| 14 | Modernization | #54 | - | Backlog. Needs a splitting/planning pass before any implementation (minus the annotations pulled forward at registry time). |

**Held dependabot majors (deliberate, 2026-07-11):** zod 4 (#63), TypeScript 7 (#65), action-gh-release 3 (#59). Decide after 0.4.0 + registry, not during Phase 2 - don't mix major dep bumps with behavioral robustness changes. Evaluate zod 4 together with #54's structured-output design (both touch every tool schema). Lesson from the recap applies: CI-green is not sufficient for majors; each needs a live client-to-server smoke test (`tools/list` + one real tool call) before merging.

**Consolidation guardrail:** no further merging. Combining the two Phase 2 pairs into one PR would put four behavioral changes to the data path in a single diff - a regression couldn't be bisected by revert.

## Post-#39 review follow-ups (2026-07-11) - RESOLVED, all tracked

Surfaced while reviewing PR #39 against live `Purchase` data. All now filed and slotted above:

- **`vintageLabel()` extraction** → folded into #46 (recorded as an issue comment so a fresh implement session sees it).
- **"Incoming orders" tool over `Pending`** → filed as #70 (the audit had assumed #39 exposed `Pending`; it uses `Purchase`). Paired with #71 in the execution table.
- **`recent-deliveries` empty-window hint** → filed as #71.
- **#53 scope growth** (recent-deliveries in skill docs) → recorded as a comment on #53.
- **#49 body correction** (Pending → Purchase mischaracterization) → issue body edited 2026-07-11.
