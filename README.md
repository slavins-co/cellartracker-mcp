# cellartracker-mcp

MCP server and Claude plugin for [CellarTracker](https://www.cellartracker.com/) wine cellar data. Query your inventory, get drinking recommendations, analyze purchases, and manage your wishlist — all from Claude.

## What it does

Connects Claude to your CellarTracker account via MCP (Model Context Protocol). Instead of manually exporting and uploading CSVs, Claude can query your cellar data directly through 6 tools. Also includes two skills: one for interpreting CellarTracker data, and one for evaluating wine purchases.

## Prerequisites

- **Python 3.10+** — Check with `python3 --version`. On macOS, install via [Homebrew](https://brew.sh): `brew install python3`
- **pip** — Comes with Python. Check with `pip3 --version`
- **Claude Code** — Install from [claude.com/claude-code](https://claude.com/claude-code)

## Quick start

### 1. Clone and install

```bash
git clone https://github.com/slavins-co/cellartracker-mcp.git
cd cellartracker-mcp
pip3 install -e .
```

### 2. Add your CellarTracker credentials

```bash
cp .env.example .env
```

Open `.env` in a text editor and replace the placeholder values with your CellarTracker username and password (the same ones you use to log in at cellartracker.com).

### 3. Run with Claude Code

From inside the `cellartracker-mcp` directory:

```bash
claude --plugin-dir .
```

That's it — ask Claude about your cellar. The MCP tools and skills load automatically.

### Claude Desktop (alternative)

If you use Claude Desktop instead of Claude Code:

```bash
pip3 install cellartracker-mcp
```

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "cellartracker": {
      "command": "cellartracker-mcp",
      "env": {
        "CT_USERNAME": "your_username",
        "CT_PASSWORD": "your_password"
      }
    }
  }
}
```

Restart Claude Desktop.

### Claude.ai (remote MCP)

Remote MCP requires hosting the server on a publicly accessible endpoint. See the [MCP docs on remote servers](https://modelcontextprotocol.io/docs/develop/connect-remote-servers) for hosting options. The server code supports both stdio and HTTP transports.

## Configuration

### Credentials

Set your CellarTracker username and password (same as your web login). Resolution order:

1. Environment variables: `CT_USERNAME`, `CT_PASSWORD`
2. `.env` file in current directory
3. `~/.config/cellartracker-mcp/.env`

### Cache

Exported data is cached locally and auto-refreshes when older than 24 hours. Override the cache location:

```bash
export CT_CACHE_DIR=/path/to/cache
```

Default: `~/.cache/cellartracker-mcp/exports/`

## MCP Tools

| Tool | Description |
|------|-------------|
| `search_cellar` | Query inventory by wine name, color, region, varietal, location, or vintage range |
| `drinking_recommendations` | Get prioritized list of wines to open based on drinking windows and maturity |
| `cellar_stats` | Collection overview with breakdowns by color, region, varietal, location, or category |
| `purchase_history` | Spending analysis with filters by store, date range, or wine name |
| `get_wishlist` | View wishlist items with ratings, prices, and notes on why each was added |
| `refresh_data` | Force a fresh pull from CellarTracker (normally auto-refreshes every 24h) |

## Included Skills

### cellartracker-data

Teaches Claude how to interpret CellarTracker export data: cross-reference tables via iWine join key, decode 30+ professional reviewer score abbreviations, interpret drinking windows and maturity curves, and route queries to the right tables.

### wine-purchase-evaluator

A disciplined framework for evaluating wine purchases. Uses a two-score system (Global Quality + Personal Fit) with BUY/CONSIDER/PASS verdicts. Checks cellar redundancy, verifies pricing against real market data, and applies drinking window discipline.

**Customizing the evaluator:** Copy `skills/wine-purchase-evaluator/references/preferences-example.md` to `preferences.md` in the same directory. Edit to match your cellar constraints, preferred regions, budget rules, and retailer knowledge.

## How CellarTracker data works

CellarTracker has no official API. This server uses their URL-based CSV export endpoint (`xlquery.asp`), which authenticates with your username and password as query parameters over HTTPS. This is the same mechanism used by CT's Excel export feature and the unofficial `cellartracker` PyPI package.

**Data scope:** The server can only query YOUR data — your inventory, purchases, notes, and wishlist. It cannot search CellarTracker's full wine database for wines you don't own.

**8 tables exported:** List (inventory), Notes (tasting notes), Purchase (buy history), Consumed (drinking log), Availability (maturity/scores), Tag (wishlists), Bottles (per-bottle records), Pending (in-transit orders).

**Caching:** Data is pulled once and cached as CSV files. Auto-refreshes when cache is older than 24 hours. Use `refresh_data` to force an immediate refresh.

## Development

```bash
git clone https://github.com/slavins-co/cellartracker-mcp.git
cd cellartracker-mcp
pip3 install -e .

# Set credentials
cp .env.example .env
# Edit .env with your CT credentials

# Test the server imports correctly
python3 -c "from cellartracker_mcp.server import mcp; print('OK:', list(mcp._tool_manager._tools.keys()))"

# Test with MCP inspector
mcp dev src/cellartracker_mcp/server.py

# Test as Claude Code plugin
claude --plugin-dir .
```

## License

MIT
