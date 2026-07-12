# Audit Implementation Plan - 2026-07-11

Source: full audit in the vault at `_System/Audits/2026-07-11-CellarTracker-MCP-Audit.md`. All code findings are filed as GitHub issues (#40-#54, plus post-#39 follow-ups #69-#71), each self-contained for implementation in a fresh session (`/implement <issue>`). This plan sequences them and records the strategic decisions.

Status 2026-07-11 EOD: Phase 1 complete - #40/#41/#42 closed, PR #39 merged (HOLD), v0.3.2 released to npm + .mcpb. Session recap: vault `1-Stream/Session-Recaps/2026-07-11-cellartracker-external-pr-and-v032-release.md`.

Status 2026-07-12: **AUDIT ARC COMPLETE.** Phase 2 shipped via PRs #72-#76; PR #77 added docs sync (#53) + tool annotations (#54 partial); **v0.4.0 released** (all robustness findings); **v0.4.1 released** (registry metadata: `mcpName`, `server.json`, six-location verify-versions); **published to the official MCP Registry** as `io.github.slavins-co/cellartracker-mcp` (verified via public API). Local install verified at 0.4.x (staleness class confirmed dead). Suite at 127 tests.

Remaining tail (all optional, unscheduled): Phase 3 features → 0.5.0, #54 backlog remainder, held dependabot majors, PyPI 0.1.0 deprecation, one-time ToS read.

## Decisions

**Read-only: CONFIRMED (2026-07-11).** The server stays read-only. Rationale: CellarTracker has no sanctioned write path - exports are explicitly one-way, the private partner API is closed, and the only project that writes back (RoarKri/mcp-cellartracker) scrapes the authenticated web app and carries WAF-detection code because it breaks. With full-account credentials, a write bug corrupts real cellar data; read-only caps the blast radius at disclosure. Deep links (#52) are the read-only-compatible answer to "let me act on a recommendation."

**MCP registry submission: DONE (2026-07-12).** Gated on 0.4.0 as decided; executed immediately after via the metadata-only v0.4.1 (the registry validates npm ownership by reading `mcpName` from the published package, which forced the patch release). Pros/cons record below - the standing obligation accepted with it: a registry listing invites users, so the maintenance-appetite question is now answered "yes" by action.

## Phase 1 - Hygiene (SHIPPED as v0.3.2, 2026-07-11)

Order matters: #40 first (it fixes the class of defect that makes everything else unverifiable on this machine).

| # | Issue | Size |
|---|---|---|
| [#40](https://github.com/slavins-co/cellartracker-mcp/issues/40) | Build staleness: `prepare` script + rebuild dist | S |
| [#41](https://github.com/slavins-co/cellartracker-mcp/issues/41) | CI on push/PR, Dependabot config, SECURITY.md | S |
| [#42](https://github.com/slavins-co/cellartracker-mcp/issues/42) | Version string in refresh-data output | XS |
| - | **Review PR #39** (recent-deliveries over `Purchase`.Delivered, external contributor) - after #41 so CI runs on it | S |

Maintainer-only actions (settings/accounts, not code sessions):
- [x] Enable branch protection on main requiring the new CI check (verified 2026-07-12: `test` required).
- [x] Dependabot config in place (grouping + hold-majors, 2026-07-11); verify the alerts/security-updates toggle in repo settings if not already on.
- [ ] Deprecate PyPI `cellartracker-mcp` 0.1.0 with a pointer to npm (needs PyPI account).
- [ ] One manual read of CellarTracker ToS re: automated access (their terms page 403s automated fetches).

## Phase 2 - Robustness (SHIPPED as v0.4.0, 2026-07-12)

All merged via PRs #72-#76 in the planned groupings. #43 and #47 both touch exporter.ts error paths - do #43 before #47 if running back-to-back.

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

## Phase 3 - Features (→ 0.5.0, unscheduled; #53 already shipped in 0.4.0)

| # | Issue | Size | Sequencing |
|---|---|---|---|
| [#49](https://github.com/slavins-co/cellartracker-mcp/issues/49) | Bottle-level tool (Bottles table, already fetched) | M | After PR #39 merges |
| [#50](https://github.com/slavins-co/cellartracker-mcp/issues/50) | Food-pairing tool (FoodTags table, new fetch) | M | - |
| [#51](https://github.com/slavins-co/cellartracker-mcp/issues/51) | Pro-reviews tool (ProReview table, new fetch) | M | Low value unless user enters pro reviews |
| [#52](https://github.com/slavins-co/cellartracker-mcp/issues/52) | CellarTracker deep links (iWine) in output | S | Verify URL pattern first |
| ✅ [#53](https://github.com/slavins-co/cellartracker-mcp/issues/53) | Docs sync (skill drift, README wishlist claim, + recent-deliveries) | S | DONE - shipped in PR #77, rode the 0.4.0 release |
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
| 1 | ✅ Build staleness | #40 + #42 | Sonnet | Done 2026-07-11. `prepare` script prevents stale builds; version line in refresh-data makes future staleness visible. #40's optional verify-versions dist check: **consciously skipped** (2026-07-11) - a manual check only protects the dev who remembers to run it, and Synology Drive mtime churn makes it false-positive prone. Do not resurrect. |
| 2 | ✅ CI + hygiene | #41 | Sonnet | Done 2026-07-11; branch protection verified active 2026-07-12 (`test` required). |
| 3 | PR #39 review | - | Opus | **Reviewed 2026-07-11 (HOLD).** Holding comment posted 07-11 (done). **Table correction:** it queries the `Purchase` table (`Delivered=True` rows by `DeliveryDate`), *not* Pending - the contributor's choice is correct. The M/D/YYYY date trap and the `Delivered="True"` (capital-T) casing are both already handled (`toIsoDate` + `.toLowerCase()`) - verified against live data. `maintainerCanModify=true`, so push two fixups to `patch-1`: harden a test fixture `"true"`→`"True"` (locks case-insensitivity), fix cosmetic indent/whitespace. Vintage `1001`→`NV` kept (see #46). Merge (merge-commit or squash preserving contributor authorship) after CI goes green - branch predates the workflow so `statusCheckRollup` is empty until the branch is updated. Do NOT run `/implement` on it (that re-forks the work and erases authorship). |
| - | ✅ **Release 0.3.2** | | | Shipped 2026-07-11 (second attempt; see #69 origin). |
| 4 | ✅ Refresh reliability | #43 + #44 | Opus | Done - PR #72 (2026-07-12). |
| 5 | ✅ Fetch resilience | #45 + #47 | Opus | Done - PR #73 (2026-07-12). |
| 6 | ✅ Small batch (4 items incl. vintageLabel) | #46 | Sonnet | Done - PR #74 (2026-07-12). |
| 7 | ✅ Diacritic search | #48 | Sonnet | Done - PR #75 (2026-07-12). |
| 8 | ✅ Publish dry-run CI | #69 | Sonnet | Done - PR #76 (2026-07-12), landed before the tag as required. |
| 8.5 | ✅ Annotations + docs sync | #53 + part of #54 | Sonnet | Done - PR #77 (2026-07-12), incl. #48-style drift fix in the second skill, protocol-level annotation tests, `openWorldHint: false` on clear-user-data. refresh-data `readOnlyHint: true` debate resolved on the PR - settled, do not revisit. |
| - | ✅ **Release 0.4.0** | | | Shipped 2026-07-12, first attempt clean (npm with provenance + .mcpb attached; the #69 dry-run guard did its job). Local-install verification passed (user confirmed 0.4.0 after plugin reinstall; note: marketplace remove/re-add was the only UI path that worked for updating - plugin-update UX rough edge). |
| - | ✅ **Release 0.4.1** | | | Shipped 2026-07-12. Metadata-only: `mcpName` in package.json (required - registry ownership validation reads the *published* npm package), `server.json`, verify-versions → scripts/verify-versions.mjs (six locations + registry identity), README pin example. |
| - | ✅ **Registry submission** | | | **DONE 2026-07-12.** Published `io.github.slavins-co/cellartracker-mcp` v0.4.1 to registry.modelcontextprotocol.io (verified via public API). Required a metadata-only v0.4.1 npm publish carrying `mcpName` (registry ownership validation reads the published package). `server.json` committed; `verify-versions` now scripts/verify-versions.mjs covering six version locations + registry identity. Glama's "cannot be installed" flag traced to their automated probe ("Quality: not tested"), nothing actionable our side - expect aggregators to re-index from the official registry. **This closes the last 2026-07-11 audit-arc item.** |
Everything above this line is complete. (#53 shipped inside PR #77 rather than as its own PR - the old "docs sync first" row is subsumed.)

### Outstanding work (→ 0.5.0, unscheduled)

PR groupings reconfirmed 2026-07-12, post-#77. One sequencing note dissolved: "do #53 first because the tool PRs touch the same skill docs" no longer applies - drift is fixed, so each tool PR simply updates the skill docs as part of its own diff.

| Order | PR | Issues | Model | Plan-review? | Notes |
|---|---|---|---|---|---|
| 1 | Orders & deliveries | #70 + #71 | Sonnet | No | **Combine confirmed:** same domain (Pending/deliveries), same server.ts neighborhood, both small; #70 reuses recent-deliveries' conventions. Natural 0.5.0 opener. |
| 2 | Bottles tool | #49 | Opus | Yes | **Solo confirmed:** open design (Bottles vs Inventory, tool UX) shouldn't share a diff with anything. |
| 3 | New tables | #50 + #51 | Opus | #50 only | **Combine confirmed:** identical pattern (new table fetch + tool + schema discovery on first authenticated pull); #51 rides #50's established pattern. |
| 4 | Deep links | #52 | Sonnet | No | **Solo confirmed:** carries its own URL-verification step; grouping buys nothing. |
| - | **Release 0.5.0** | | | | None of rows 1-4 are coupled - a partial 0.5.0 is fine whenever appetite runs out. |
| 5 | Modernization | #54 remainder | - | Yes - splitting pass | structuredContent/outputSchema, pagination, optional MCP resources. Evaluate the zod 4 major (#63) together with the structured-output slice - both touch every tool schema. |

Non-PR maintainer items still open:
- Held dependabot majors: action-gh-release 3 (#59 - most worthwhile, clears the Node 20 deprecation warning in the publish workflow), zod 4 (#63 - pair with #54), TypeScript 7 (#65). Each needs a live client→server smoke test; CI-green is not sufficient for majors.
- Deprecate PyPI `cellartracker-mcp` 0.1.0 with a pointer to npm.
- One-time manual read of CellarTracker ToS re: automated access.

**Held dependabot majors (deliberate, 2026-07-11):** zod 4 (#63), TypeScript 7 (#65), action-gh-release 3 (#59). Decide after 0.4.0 + registry, not during Phase 2 - don't mix major dep bumps with behavioral robustness changes. Evaluate zod 4 together with #54's structured-output design (both touch every tool schema). Note: the 0.4.0 publish run warned that the pinned action-gh-release targets deprecated Node 20 - #59 resolves that, making it the least optional of the three. Lesson from the recap applies: CI-green is not sufficient for majors; each needs a live client-to-server smoke test (`tools/list` + one real tool call) before merging.

**Consolidation guardrail:** no further merging. Combining the two Phase 2 pairs into one PR would put four behavioral changes to the data path in a single diff - a regression couldn't be bisected by revert.

## Post-#39 review follow-ups (2026-07-11) - RESOLVED, all tracked

Surfaced while reviewing PR #39 against live `Purchase` data. All now filed and slotted above:

- **`vintageLabel()` extraction** → folded into #46 (recorded as an issue comment so a fresh implement session sees it).
- **"Incoming orders" tool over `Pending`** → filed as #70 (the audit had assumed #39 exposed `Pending`; it uses `Purchase`). Paired with #71 in the execution table.
- **`recent-deliveries` empty-window hint** → filed as #71.
- **#53 scope growth** (recent-deliveries in skill docs) → recorded as a comment on #53.
- **#49 body correction** (Pending → Purchase mischaracterization) → issue body edited 2026-07-11.
