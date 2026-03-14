# CellarTracker MCP

Connect Claude to your [CellarTracker](https://www.cellartracker.com/) wine cellar. Query your inventory, get drinking recommendations, analyze purchases, and evaluate new wines — all through natural conversation.

## Install

Two install methods cover different Claude Desktop modes. You may need one or both:

| | Desktop Extension (.mcpb) | Claude Code Plugin |
|---|---|---|
| **Works in** | Chat, Cowork | Cowork, Code |
| **Tools** | 8 cellar tools | All 9 tools |
| **Skills** | No | Yes |
| **Setup** | One-click download | Marketplace or CLI |
| **Credentials** | Prompted on install, stored in OS keychain | Run `setup-credentials` after install |

**Which do I need?**

- **Chat only** → Desktop Extension
- **Code only** → Claude Code Plugin
- **Cowork only** → Either works (plugin adds skills)
- **Full coverage** → Install both — no conflicts

Installing both is safe. The extension covers Chat; the plugin covers Cowork and Code. In Cowork, both are accessible without conflict.

### Desktop Extension (Chat & Cowork)

One-click install. No terminal needed.

1. Download `cellartracker-mcp.mcpb` from the [latest release](https://github.com/slavins-co/cellartracker-mcp/releases/latest)
2. Double-click the file to install in Claude Desktop
3. Enter your CellarTracker username and password when prompted
4. Start chatting — *"What wines should I open this week?"*

Credentials are stored in your OS keychain (macOS Keychain / Windows Credential Manager). To update them later, go to Settings > Extensions > CellarTracker.

### Claude Code Plugin (Cowork & Code)

Full experience with tools **and** skills.

#### Via Desktop app

1. Open the Code tab > Customize > Browse plugins > **+** > Add marketplace from GitHub > enter `slavins-co/cellartracker-mcp`
2. Find "CellarTracker MCP" in the plugin browser and click **Install**
3. **Set up credentials immediately** — say: *"Set up my CellarTracker credentials"*

#### Via terminal

**Step 1:** Add the marketplace
```
/plugin marketplace add slavins-co/cellartracker-mcp
```

**Step 2:** Install the plugin
```
/plugin install cellartracker-mcp@cellartracker-mcp
```

**Step 3:** Set up credentials immediately — say:
> *"Set up my CellarTracker credentials"*

Claude will verify and save them. No restart needed. Without credentials, tools will return errors and skills won't have data to work with.

**Alternative:** Set `CT_USERNAME` and `CT_PASSWORD` as environment variables in your shell profile.

Credentials are stored only on your machine. When using the setup tool, they pass through Anthropic's servers as part of the conversation. They are sent to CellarTracker's servers for authentication.

## What you can do

| Tool | What it does |
|------|-------------|
| `setup-credentials` | Connect your CellarTracker account (Claude Code plugin only — Desktop Extension handles credentials during install) |
| `search-cellar` | Find wines by name, color, region, varietal, location, or vintage |
| `drinking-recommendations` | Wines to open now, sorted by drinking window urgency |
| `cellar-stats` | Collection overview — totals and breakdowns by any dimension |
| `purchase-history` | Spending analysis by store, date range, or wine |
| `get-wishlist` | Your wishlist with ratings, notes, and prices |
| `consumption-history` | Wines you've opened — by name, color, or date range |
| `tasting-notes` | Your tasting notes and reviews with ratings and scores |
| `refresh-data` | Force a fresh pull (auto-refreshes every 24 hours) |

## Included skills

> **Note:** Skills are available in Cowork and Code modes via the Claude Code plugin. Chat mode (Desktop Extension) provides tools only.

**cellartracker-data** — Teaches Claude to interpret CellarTracker data: table relationships, score abbreviations, drinking windows, and query routing.

**wine-purchase-evaluator** — Framework for evaluating wine purchases. Two-score system (Quality + Personal Fit) with BUY/CONSIDER/PASS verdicts. Checks your cellar for redundancy, verifies pricing, and applies drinking window discipline.

To customize the evaluator for your preferences, copy `skills/wine-purchase-evaluator/references/preferences-example.md` to `preferences.md` in the same directory and edit it.

## How it works

CellarTracker has no official API. This server uses their CSV export endpoint, which authenticates with your username and password over HTTPS. Data is cached locally and auto-refreshes every 24 hours.

The server can only access **your** data — inventory, purchases, notes, and wishlist. It cannot search CellarTracker's full wine database.

## Development

For contributors or anyone who wants to run from source:

```bash
git clone https://github.com/slavins-co/cellartracker-mcp.git
cd cellartracker-mcp
npm install
npm run build

# Set credentials
cp .env.example .env
# Edit .env with your CT login

# Test as Claude Code plugin
claude --plugin-dir .
```

## License

MIT
