---
name: cellartracker-data
description: Parse and query CellarTracker data for wine cellar management, inventory analysis, drinking window decisions, purchase history, consumption tracking, wishlist management, and scoring lookups. Uses MCP tools as the primary data source when available, with CSV fallback. Use this skill whenever the user asks about their cellar inventory, wants drinking window guidance, asks about past purchases or consumption history, references their wishlist, needs bottle counts or storage analysis, or asks anything that requires querying their wine collection data. Also trigger when the user says "check my cellar", "what do I have", "what should I drink", "my wishlist", "drinking window", "what have I consumed", "purchase history", or references CellarTracker data. This skill works alongside the wine-purchase-evaluator skill — use both together when evaluating purchases against existing inventory.
---

# CellarTracker Data Parser

This skill enables Claude to parse, query, and cross-reference CellarTracker data for cellar management, purchase decisions, and drinking window guidance.

## Data Source

**When MCP tools are available (Claude Code or Claude Desktop)**, use the following tools for live data:
- `search-cellar` — query current inventory by wine name, region, varietal, producer, etc.
- `drinking-recommendations` — get maturity-aware suggestions for what to drink
- `cellar-stats` — overview of cellar composition (counts, categories, regions)
- `purchase-history` — full buy history with pricing and retailer info
- `recent-deliveries` — wines actually received in a date range, by delivery date
- `incoming-orders` — wines ordered but not yet received, from the Pending table
- `get-wishlist` — current wishlist with notes on why each wine was added
- `consumption-history` — wines you've opened, with tasting context
- `tasting-notes` — your tasting notes and reviews with ratings and scores
- `refresh-data` — force a fresh pull from CellarTracker

**When MCP is not available (Claude.ai Projects)**, look for uploaded CSV files:
- Individual `*_latest.csv` files (most common)
- Timestamped files like `List_20260313_015000.csv`
- Or attached directly in conversation

## Table Overview

Eight tables are exported from CellarTracker. Not all will always be available — work with what's present.

| Table | Primary Use | Key Columns |
|---|---|---|
| **List** | Current cellar inventory | Location, Bin, Price, Valuation, pro scores, drinking window |
| **Notes** | Tasting notes | Rating, TastingNotes, TastingDate, CScore |
| **Purchase** | Full buy history | StoreName, Price, PurchaseDate, Quantity, Remaining |
| **Consumed** | Drinking log | Consumed date, ConsumptionNote, context (who, food, occasion) |
| **Availability** | Maturity & pro scores | Drinking windows (multiple sources), all professional scores, maturity curves |
| **Tag** | Wishlists & custom lists | ListName, WinesNotes (why it's on the list) |
| **Bottles** | Individual bottle records | BottleState, per-bottle notes, combines cellar + consumed |
| **Pending** | In-transit orders | Same as Purchase but undelivered; use `incoming-orders` |

### Table Priority for Common Tasks

- **"What should I drink tonight?"** — List (inventory + location) + Availability (maturity) + Notes (past impressions)
- **"Evaluate this purchase"** — List (redundancy check) + Tag (is it on wishlist?) + Purchase (have I bought this before?)
- **"What have I been drinking?"** — Consumed (patterns, frequency, notes)
- **"Cellar overview / audit"** — List (full inventory) + Availability (what's past peak?)
- **"How much have I spent?"** — Purchase (complete spend history)
- **"What's on the way / still coming?"** — Pending (in-transit orders not yet received)

## Parsing Instructions

All CT export CSVs share these characteristics:
- UTF-8 encoded (charset detected from CellarTracker's response headers, falling back to windows-1252)
- Quoted fields, comma-delimited
- First row is always headers
- `iWine` is the universal join key across all tables
- NV (non-vintage) wines use vintage `1001`

### Reading CSVs

```python
import csv
with open('List_latest.csv') as f:
    reader = csv.DictReader(f)
    rows = list(reader)
```

### Key Join Pattern

Cross-reference tables using `iWine`:
```python
# Example: Match inventory to availability/maturity data
list_by_wine = {row['iWine']: row for row in list_rows}
for avail_row in availability_rows:
    cellar_row = list_by_wine.get(avail_row['iWine'])
    if cellar_row:
        # Now have both inventory location AND maturity data
```

## Column Reference

For full column schemas for all 8 tables, see the schema reference file in `references/schema.md`.

**Load the schema reference when you need to:**
- Look up specific column names or meanings
- Decode professional reviewer abbreviations (WA, WS, AG, etc.)
- Understand maturity curve fields (Available, Bell, Linear, etc.)
- Parse drinking window source hierarchy

## Professional Score Abbreviations

The most commonly relevant scores (full list in schema reference):

| Code | Reviewer |
|---|---|
| WA | Wine Advocate (Robert Parker / successors) |
| WS | Wine Spectator |
| AG | Antonio Galloni (Vinous) |
| JR | Jancis Robinson |
| WE | Wine Enthusiast |
| BH | Burghound (Allen Meadows) |
| JS | James Suckling |
| CT | CellarTracker community average |
| MY | User's personal score |

**Score display rules:**
- CT community scores are often decimals (e.g., `88.7777...`) — round to 1 decimal
- `MY` is the user's personal rating — always flag when present
- Empty string = no score available, not zero
- In Availability table, scores also have `Web` (link) and `Sort` (numeric) variants

## Drinking Window Logic

The Availability table provides the richest maturity data. Key fields:

- `BeginConsume` / `EndConsume`: Consensus or personal drinking window (date format: `M/D/YYYY` or `YYYY`)
- `Source`: Where the window comes from — `Personal`, `Community`, or a professional reviewer name
- `Available`: Maturity percentage (0-1 = approaching peak, ~1 = at peak, >1 = past peak)
- `Bell` / `Linear` / `Early` / `Late` / `Fast` / `TwinPeak` / `Simple`: Different maturity curve models

**Maturity interpretation:**
- `Available` < 0.3 — Too young, needs significant time
- `Available` 0.3-0.7 — Approaching window, can open with decanting
- `Available` 0.7-1.0 — In window, good to drink
- `Available` > 1.0 — Past peak or at tail end of window

**Window source priority:** Personal > Professional reviewer > Community

The List table also has `BeginConsume`/`EndConsume` as year integers — use these as quick reference, Availability for detail.

## Location & Storage Mapping

The List table's `Location` and `Bin` fields map to physical storage. These are example locations — your CellarTracker locations will vary based on your setup:

| Location value | Physical space | Notes |
|---|---|---|
| `Wine Fridge` | Dual-zone fridge | Bin format: `row-position` (e.g., `1-3` = row 1, slot 3) |
| `Bar Cabinet` | Dark cabinet storage | Bin: `Drawer 1`, `Drawer 2`, `Shelf Rack` |
| `Rack` | Floor racks | Usually no bin specified |
| `Boxed` | Still in shipping box | Overflow / recently arrived |
| `Cellar` | Generic / unspecified | May need location update |

## Common Query Patterns

### Bottle Count & Capacity
```python
# Active cellar size (exclude pending)
cellar_count = sum(int(row['Quantity']) for row in list_rows)
```
Report against your cellar capacity targets when known.

### Category Breakdown
```python
# Group by color, region, varietal, etc.
from collections import Counter
by_color = Counter(row['Color'] for row in list_rows)
by_region = Counter(row['Region'] for row in list_rows)
by_varietal = Counter(row['MasterVarietal'] for row in list_rows)
```

### Redundancy Check (for purchase evaluator)
When checking if a new wine would be redundant:
1. Same producer? — Flag
2. Same varietal + region? — Count existing
3. Same broad style (e.g., "California Chardonnay")? — Count existing
4. On wishlist? — Note as positive signal

### Drinking Priority
Combine List + Availability to find what should be opened soon:
- `Available` > 1.0 — Past peak, drink ASAP
- `EndConsume` year <= current year — Window closing
- Location = `Rack` — Already in drink-soon storage

### Spend Analysis
Purchase table tracks all historical buys:
- `Price` = cost per bottle in USD
- `Remaining` vs `Quantity` shows consumption rate
- `StoreName` tracks where bottles were sourced
- `OrderNumber` sometimes has context (e.g., "Gift from Liz")

### Wishlist Cross-Reference
Tag table with `ListName` = `*Wishlist`:
- `WinesNotes` often has context on why it was added (e.g., "Reddit QPR white burgundy", "Konstantin Baum best wines of 2025")
- Use during purchase evaluation: if a wine is on the wishlist, it's a positive signal

## Integration with Other Skills

### wine-purchase-evaluator
When evaluating purchases, this skill provides:
- **Redundancy data** from inventory (same producer, varietal, region) — use `search-cellar` MCP tool or List CSV
- **Wishlist match** from wishlists — use `get-wishlist` MCP tool or Tag CSV
- **Historical pricing** from purchase history — use `purchase-history` MCP tool or Purchase CSV
- **Consumption velocity** from consumption log — use Consumed CSV

### General wine advisory
- **"What should I drink with X?"** — Query inventory for available bottles matching the pairing need, check maturity
- **"Tell me about my cellar"** — Full inventory analysis with category breakdown, maturity overview, valuation summary
- **"What's past its peak?"** — Find wines where Available > 1.0

## Output Style

When presenting cellar data:
- Round CT community scores to 1 decimal place
- Format valuations as USD with 2 decimal places
- Use drinking window as year range (e.g., "2025-2030"), not full dates
- Flag wines past peak with a clear indicator
- When listing inventory, include Location for actionability
- Keep tables tight — don't dump all columns, select what's relevant to the query
