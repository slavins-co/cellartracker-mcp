#!/usr/bin/env bash
set -euo pipefail

# Re-install production-only deps (matches what the .mcpb bundle ships)
# and pack, without publishing. --ignore-scripts skips the `prepare`
# rebuild - dist must already be built by the caller; running `prepare`
# here would re-run tsc without devDependencies and fail (issue #40,
# PR #55; this collision broke the first v0.3.2 release attempt).
#
# Shared by ci.yml (dry-run, every push/PR) and publish.yml (real
# release) so the two can't drift apart - keep this the single source
# of truth for the packaging path, not the workflow YAML.
rm -rf node_modules
npm ci --omit=dev --ignore-scripts

# Clear any stale .mcpb from a prior local run so the check below
# actually proves this run produced one, not a leftover.
rm -f ./*.mcpb

# --omit=dev strips @anthropic-ai/mcpb from node_modules, so a bare
# `npx @anthropic-ai/mcpb` can't resolve it locally and silently falls
# back to fetching registry "latest", ignoring the devDependency pin.
# Pin explicitly to what package.json declares.
MCPB_VERSION=$(node -e "console.log(require('./package.json').devDependencies['@anthropic-ai/mcpb'].replace(/^[^0-9]*/, ''))")
npx --package="@anthropic-ai/mcpb@${MCPB_VERSION}" mcpb pack .

shopt -s nullglob
mcpb_files=(*.mcpb)
if [ ${#mcpb_files[@]} -eq 0 ]; then
  echo "ERROR: no .mcpb file produced by 'mcpb pack'" >&2
  exit 1
fi
echo "OK: produced ${mcpb_files[*]}"
