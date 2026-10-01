# cellartracker-mcp

TypeScript MCP server and Claude Code plugin for CellarTracker. This repo is public: keep personal details, hostnames and credentials out of code, fixtures, commits, PRs and issues.

## Commands

- Install: `npm ci` (a SessionStart hook runs it automatically in cloud sessions)
- Build: `npm run build`
- Test: `npm test` (vitest). Run the full suite and read the result before calling work done.
- Package check: `npm run pack:check`

## Rules

- On every version bump, run `npm run verify-versions`. The version lives in three files: `package.json`, `.claude-plugin/plugin.json` and `manifest.json`.
- Read `tasks/lessons.md` before planning. It holds this repo's technical gotchas.
- Commit messages, PR titles and bodies, issues and comments carry no AI attribution (no Co-Authored-By trailer, no "Generated with Claude Code" line) and no session shorthand. Write them for a reader who never saw the session.
- Merges, releases, tag pushes and npm publishes belong to the maintainer. In cloud sessions a hook refuses them: open the PR and stop there.
- Live CellarTracker calls need credentials that cloud sessions don't have. Work from the tests and fixtures.
