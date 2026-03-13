# CellarTracker MCP

Connect Claude to your [CellarTracker](https://www.cellartracker.com/) wine cellar. Query your inventory, get drinking recommendations, analyze purchases, and evaluate new wines — all through natural conversation.

## Install

Works with both **Claude Desktop** (mac app) and **Claude Code**. No prerequisites — Claude Desktop includes everything needed.

### Step 1: Add the marketplace

**Claude Desktop:** Settings > Customize > Browse plugins > **+** > Add marketplace from GitHub > enter `slavins-co/cellartracker-mcp`

**Claude Code:**
```
/plugin marketplace add slavins-co/cellartracker-mcp
```

### Step 2: Install the plugin

**Claude Desktop:** Find "CellarTracker MCP" in the plugin browser and click **Install**.

**Claude Code:**
```
/plugin install cellartracker-mcp@cellartracker-mcp
```

### Step 3: Set up your CellarTracker credentials

Set `CT_USERNAME` and `CT_PASSWORD` environment variables with your cellartracker.com login. Choose one method:

**Option A — Shell profile** (recommended for most users):

Add to your `~/.zshrc` (or `~/.bashrc`):

```bash
export CT_USERNAME=your_cellartracker_username
export CT_PASSWORD=your_cellartracker_password
```

Then restart your terminal or run `source ~/.zshrc`.

**Option B — Config file** (alternative for CLI users):

```bash
mkdir -p ~/.config/cellartracker-mcp
cat > ~/.config/cellartracker-mcp/.env << 'EOF'
CT_USERNAME=your_cellartracker_username
CT_PASSWORD=your_cellartracker_password
EOF
chmod 600 ~/.config/cellartracker-mcp/.env
```

Credentials are stored only on your machine and never sent anywhere except CellarTracker's own servers.

### Step 4: Restart Claude

Fully quit and reopen Claude Desktop, or restart your Claude Code session.

Try it: *"What wines should I open this week?"*

## What you can do

| Tool | What it does |
|------|-------------|
| `search-cellar` | Find wines by name, color, region, varietal, location, or vintage |
| `drinking-recommendations` | Wines to open now, sorted by drinking window urgency |
| `cellar-stats` | Collection overview — totals and breakdowns by any dimension |
| `purchase-history` | Spending analysis by store, date range, or wine |
| `get-wishlist` | Your wishlist with ratings, notes, and prices |
| `refresh-data` | Force a fresh pull (auto-refreshes every 24 hours) |

## Included skills

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
