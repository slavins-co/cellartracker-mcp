# Wine Purchase Evaluator - Usage Guide

## Overview

The Wine Purchase Evaluator skill provides a disciplined, storage-aware framework for evaluating wine purchases. It emphasizes educational value, quality-to-price ratio (QPR), and cellar discipline while maintaining a default PASS stance.

## Installation

This skill is included with the CellarTracker MCP plugin. Once the plugin is installed and configured, the skill activates automatically when you request wine purchase evaluations.

To customize the evaluator for your cellar, copy `preferences-example.md` to `preferences.md` in the `references/` directory and edit to match your setup.

## How It Works

### Automatic Detection

The skill automatically detects the type of evaluation needed:

- **Single Wine**: Evaluates one wine with detailed analysis
- **Multiple Wines**: Evaluates batches with table format
- **Marathon Mode**: Applies stricter rules when "marathon" is mentioned

### Cellar Integration

The skill automatically attempts to check your current wine collection inventory to:
- Flag duplicate purchases
- Identify category redundancy
- Note producer overlap
- Assess storage saturation

**With MCP tools**: Uses `search_cellar`, `cellar_stats`, and `get_wishlist` for live data.
**Without MCP tools**: Looks for uploaded CSV files (e.g., `CurrentWineCollection*.csv`, `List_latest.csv`).

If no inventory data is available, evaluation continues with a note indicating inventory wasn't checked.

## Basic Usage

### Single Wine Evaluation

Simply provide wine details in any natural format:

```
Domaine Besson Chablis Vaillons 1er Cru 2022 $30 LastBottle
```

Or:

```
Evaluate this wine:
- Beringer Knights Valley Cabernet 2019
- Half bottle (375mL)
- $10 from LastBottle
- Need 6 bottles for free shipping
```

### Multiple Wine Evaluation

Provide a list, screenshot, or multiple wines:

```
Evaluate these wines:
1. Ridge Zinfandel $40
2. Chablis 1er Cru $30
3. Brunello di Montalcino $55
```

### Marathon Mode

Explicitly mention "marathon" to trigger stricter evaluation:

```
LastBottle marathon - evaluate this wine:
Pauletts Polish Hill Riesling 2022 $19
```

## Output Formats

### Single Wine (Tight Format)

- Wine name and details
- Verdict: BUY/CONSIDER/PASS
- Why: 2-4 bullet points of reasoning
- Scores: Global Quality (1-10) and Personal Fit (1-10)
- Role in cellar (if BUY)

### Multiple Wines (Table Format)

- Comparison table with all wines
- Summary of BUYs, CONSIDERs, PASSes
- Strategic guidance on the batch

## Scoring System

**Two-score approach:**

1. **Global Quality (1-10)**: Objective wine quality
   - 9-10: Elite/exceptional
   - 8-8.9: Excellent/benchmark
   - 7-7.9: Good/solid
   - <7: Mediocre or flawed

2. **Personal Fit (1-10)**: Value, timing, learning, storage, redundancy
   - 9-10: Perfect fit, rare opportunity
   - 8-8.9: Strong fit, recommended
   - 7-7.9: Acceptable fit, consider
   - <7: Poor fit, pass

**Verdict Thresholds:**
- BUY: Both scores >=8
- CONSIDER: Global >=7.5, Fit 7-7.9
- PASS: Everything else

## Key Principles

### Default Stance: PASS

Every wine must earn its place against:
- Limited storage constraints
- Budget limitations
- Learning priorities
- Existing cellar inventory

### Hard Rules (Auto-PASS)

Configured in your preferences file. Common triggers:
- Half bottles (375mL) - poor learning value
- Unknown/bulk-tier producers
- Over-represented categories in your cellar
- Trophy bottles above your budget threshold
- Drinking window >10 years

### Price Discipline

The skill:
- Never trusts claimed retail prices
- Verifies against Wine-Searcher and independent retailers
- Accounts for shipping, multiples, tax, and insurance
- Calls out "phantom MSRPs" (inflated original prices)

### Learning Framework

Wines are evaluated for educational value:
- Typicity (classic regional/varietal expression)
- Structure (acid/tannin/alcohol balance)
- Terroir expression
- Benchmark status
- Knowledge gap filling

## Purchase History

The skill logs all recommendations and can track confirmed purchases. This history is referenced in future evaluations to avoid redundancy.

To confirm a purchase:
```
I bought the Chablis 1er Cru
```

## Best Practices

1. **Provide context**: Mention if it's a marathon, flash sale, or special event
2. **Include complete info**: Wine name, vintage, price, retailer, bottle size
3. **Note shipping requirements**: If free shipping requires multiples
4. **Trust the framework**: PASS is the default for good reason
5. **Keep inventory current**: Ensure cellar data is up to date for accurate redundancy checks

## Advanced Features

### Kick-Yourself Test

Before BUY or CONSIDER, the skill applies:
> "Would skipping this at this price realistically bother me in 6 months?"

If NO — automatic PASS

### Marathon Mode Modifications

When marathon mode is detected:
- Stricter thresholds (BUY requires Global >=8.5 AND Fit >=8.5)
- Budget tracking emphasized
- Maximum 2-3 BUYs per session
- Favor study lanes over exceptions

## Customization

All personal preferences are stored in `references/preferences.md`:
- Hard rules (auto-PASS triggers)
- Retailer-specific heuristics
- Learning priorities and categories
- Over-saturated and high-priority categories
- Benchmark producers
- Budget rules and storage layout
- Regional context

Copy `references/preferences-example.md` to `references/preferences.md` and customize for your situation.

## Example Evaluations

### Example 1: Good Value, Learning Wine
```
Input: Pauletts Polish Hill Riesling Clare Valley 2022 $19

Output: BUY
- Benchmark Australian Riesling at 35% below typical retail
- High learning value (minerality, aging potential)
- Drink 2025-2030, fits rotation
- No redundancy detected
Global: 8.3 | Fit: 8.7
Role: Riesling benchmark for comparative tastings
```

### Example 2: Phantom MSRP
```
Input: Beringer Knights Valley Cab 2019 Half Bottle $10 (min 6 bottles)

Output: PASS
- Half bottle format = terrible for learning
- Effective price $26.67/750mL equivalent (massive markup)
- Redundant with existing Sonoma Cabs
- No true discount vs market
Global: 5.5 | Fit: 4.0
```

## Troubleshooting

**"Cellar inventory not checked"**
- This means the skill couldn't locate your wine collection data
- Evaluation continues but without specific redundancy checking
- Solution: Ensure MCP tools are connected or CSV files are uploaded

**Too many PASSes**
- This is working as intended - most wines should be PASS
- The framework is designed to be highly selective
- BUYs should represent ~5% of wines evaluated

**Different scores than expected**
- Remember: Two separate scores (Global Quality vs. Personal Fit)
- A wine can be objectively excellent (Global 9) but wrong for your situation (Fit 6)
- Both must be >=8 for a BUY verdict

## Design Philosophy

The skill is designed to be:
- **Strict**: Default PASS, rare BUYs
- **Direct**: No sycophancy, calls out problems
- **Educational**: Focused on learning value
- **Practical**: Storage and budget aware

If verdicts seem too harsh, remember this is intentional discipline to prevent cellar bloat and maximize educational ROI per bottle.
