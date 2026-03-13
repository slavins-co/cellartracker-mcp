"""CellarTracker MCP Server — 6 tools for querying wine cellar data."""

from datetime import datetime

from mcp.server.fastmcp import FastMCP

from cellartracker_mcp.config import get_cache_dir, get_credentials
from cellartracker_mcp.exporter import TABLES, ensure_fresh, export_all
from cellartracker_mcp.query import (
    aggregate,
    cross_reference,
    drinking_priority,
    load_table,
    search,
    spend_summary,
)

mcp = FastMCP("cellartracker")


def _get_fresh_paths() -> dict:
    """Load credentials and ensure cache is fresh. Returns table paths."""
    username, password = get_credentials()
    cache_dir = get_cache_dir()
    return ensure_fresh(username, password, cache_dir)


def _fmt_wine(row: dict, include_scores: bool = False) -> str:
    """Format a single wine row into readable text."""
    wine = row.get("Wine", row.get("WineName", "Unknown"))
    vintage = row.get("Vintage", "NV")
    location = row.get("Location", row.get("Bin", ""))
    qty = row.get("Quantity", row.get("QtyOH", ""))
    price = row.get("Price", row.get("Valuation", ""))

    lines = [f"  {vintage} {wine}"]
    if location:
        lines.append(f"    Location: {location}")
    if qty:
        lines.append(f"    Qty: {qty}")
    if price:
        lines.append(f"    Price: ${price}")

    # Drinking window
    begin = row.get("BeginConsume", row.get("BeginDrink", ""))
    end = row.get("EndConsume", row.get("EndDrink", ""))
    if begin or end:
        lines.append(f"    Window: {begin or '?'}-{end or '?'}")

    if include_scores:
        # Collect professional scores from Availability table fields
        score_fields = [
            ("CT", "CT"), ("JR", "JR"), ("WA", "WA"), ("WS", "WS"),
            ("AG", "AG"), ("WE", "WE"), ("JG", "JG"), ("D", "D"),
            ("JH", "JH"), ("VM", "VM"),
        ]
        scores = []
        for label, field in score_fields:
            val = row.get(field, "").strip()
            if val and val not in ("0", "0.0", ""):
                scores.append(f"{label}:{val}")
        if scores:
            lines.append(f"    Scores: {', '.join(scores)}")

    return "\n".join(lines)


def _maturity_label(row: dict, current_year: int) -> str:
    """Return a human-readable maturity status."""
    avail = row.get("Available", "").strip()
    end = row.get("EndConsume", row.get("EndDrink", "")).strip()

    if avail:
        try:
            a = float(avail)
            if a > 1.0:
                return "PAST PEAK — drink now!"
            elif a >= 0.7:
                return "In window — ready"
            elif a >= 0.3:
                return "Approaching window"
            else:
                return "Young — hold"
        except ValueError:
            pass

    if end:
        try:
            end_yr = int(float(end))
            if end_yr <= current_year:
                return f"Window closing ({end_yr})"
            elif end_yr <= current_year + 2:
                return f"Drink soon (by {end_yr})"
        except ValueError:
            pass

    return "No maturity data"


@mcp.tool()
def search_cellar(
    query: str | None = None,
    color: str | None = None,
    region: str | None = None,
    varietal: str | None = None,
    location: str | None = None,
    vintage_min: int | None = None,
    vintage_max: int | None = None,
) -> str:
    """Search your wine cellar by name, color, region, varietal, location, or vintage range.

    Returns matching wines with details including location, quantity, price,
    drinking window, and professional scores. Limited to 25 results.
    """
    paths = _get_fresh_paths()
    list_rows = load_table(paths["List"])
    avail_rows = load_table(paths["Availability"])

    # Build filters for the List table
    filters = {}
    if query:
        filters["Wine"] = query
    if color:
        filters["Color"] = color
    if region:
        filters["Region"] = region
    if varietal:
        filters["Varietal"] = varietal
    if location:
        filters["Location"] = location

    results = search(list_rows, filters)

    # Apply vintage range filter
    if vintage_min is not None or vintage_max is not None:
        filtered = []
        for row in results:
            try:
                v = int(row.get("Vintage", "0"))
            except (ValueError, TypeError):
                continue
            if vintage_min and v < vintage_min:
                continue
            if vintage_max and v > vintage_max:
                continue
            filtered.append(row)
        results = filtered

    # Cross-reference with availability for scores and windows
    results = cross_reference(results, avail_rows, key="iWine")

    total = len(results)
    results = results[:25]

    if not results:
        return "No wines found matching your search criteria."

    lines = [f"Found {total} wine(s) in your cellar:\n"]
    for row in results:
        lines.append(_fmt_wine(row, include_scores=True))
        lines.append("")

    if total > 25:
        lines.append(f"(Showing 25 of {total} results. Narrow your search for more specific results.)")

    return "\n".join(lines)


@mcp.tool()
def drinking_recommendations(
    color: str | None = None,
    occasion: str | None = None,
    max_results: int | None = None,
) -> str:
    """Get wine drinking recommendations sorted by urgency.

    Prioritizes wines that are past peak, then those with closing windows,
    then wines currently in their drinking window. Optionally filter by color.
    """
    if max_results is None:
        max_results = 10

    paths = _get_fresh_paths()
    list_rows = load_table(paths["List"])
    avail_rows = load_table(paths["Availability"])

    if color:
        list_rows = search(list_rows, {"Color": color})

    current_year = datetime.now().year
    prioritized = drinking_priority(list_rows, avail_rows, current_year)
    prioritized = prioritized[:max_results]

    if not prioritized:
        return "No wines found matching your criteria."

    header = "Drinking Recommendations"
    if occasion:
        header += f" — {occasion}"
    if color:
        header += f" (filtered: {color})"

    lines = [header, "=" * len(header), ""]
    for i, row in enumerate(prioritized, 1):
        wine = row.get("Wine", row.get("WineName", "Unknown"))
        vintage = row.get("Vintage", "NV")
        location = row.get("Location", row.get("Bin", ""))
        status = _maturity_label(row, current_year)

        begin = row.get("BeginConsume", row.get("BeginDrink", ""))
        end = row.get("EndConsume", row.get("EndDrink", ""))
        window = f"{begin or '?'}-{end or '?'}" if (begin or end) else "unknown"

        # Scores
        score_parts = []
        for label in ("CT", "WA", "WS", "JR", "AG"):
            val = row.get(label, "").strip()
            if val and val not in ("0", "0.0"):
                score_parts.append(f"{label}:{val}")
        scores = ", ".join(score_parts) if score_parts else "no scores"

        lines.append(f"{i}. {vintage} {wine}")
        if location:
            lines.append(f"   Location: {location}")
        lines.append(f"   Status: {status}")
        lines.append(f"   Window: {window}")
        lines.append(f"   Scores: {scores}")
        lines.append("")

    return "\n".join(lines)


@mcp.tool()
def cellar_stats(group_by: str | None = None) -> str:
    """Get cellar statistics: total bottles, value, unique wines, and optional breakdowns.

    Valid group_by options: color, region, varietal, location, category.
    """
    paths = _get_fresh_paths()
    list_rows = load_table(paths["List"])

    # Column name mapping for group_by
    column_map = {
        "color": "Color",
        "region": "Region",
        "varietal": "Varietal",
        "location": "Location",
        "category": "Category",
    }

    # Total bottles
    total_bottles = 0
    total_value = 0.0
    wines_seen = set()

    for row in list_rows:
        try:
            qty = int(row.get("Quantity", row.get("QtyOH", "0")) or "0")
        except (ValueError, TypeError):
            qty = 0
        total_bottles += qty

        try:
            price = float(row.get("Price", row.get("Valuation", "0")) or "0")
        except (ValueError, TypeError):
            price = 0.0
        total_value += price * qty

        wine_id = row.get("iWine", row.get("Wine", ""))
        if wine_id:
            wines_seen.add(wine_id)

    lines = [
        "Cellar Statistics",
        "=" * 40,
        f"Total bottles:  {total_bottles:,}",
        f"Total value:    ${total_value:,.2f}",
        f"Unique wines:   {len(wines_seen):,}",
        f"Avg per wine:   ${total_value / len(wines_seen):,.2f}" if wines_seen else "",
    ]

    if group_by:
        group_key = group_by.lower().strip()
        if group_key not in column_map:
            return f"Invalid group_by '{group_by}'. Valid options: {', '.join(column_map.keys())}"

        col = column_map[group_key]
        counts = aggregate(list_rows, col)

        lines.append("")
        lines.append(f"Breakdown by {group_by}:")
        lines.append("-" * 40)
        lines.append(f"{'Category':<30} {'Count':>6}")
        lines.append("-" * 40)
        for category, count in counts.items():
            lines.append(f"{category:<30} {count:>6}")

    return "\n".join(lines)


@mcp.tool()
def purchase_history(
    query: str | None = None,
    store: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
) -> str:
    """Search purchase history with spending summary.

    Filter by wine name, store, or date range (YYYY-MM-DD format).
    Shows total spent, average price, per-store breakdown, and recent purchases.
    """
    paths = _get_fresh_paths()
    purchase_rows = load_table(paths["Purchase"])

    # Apply search filters
    filters = {}
    if query:
        filters["Wine"] = query
    if store:
        filters["StoreName"] = store
    filtered = search(purchase_rows, filters)

    summary = spend_summary(filtered, date_from=date_from, date_to=date_to)

    lines = [
        "Purchase History Summary",
        "=" * 40,
        f"Total spent:    ${summary['total_spent']:,.2f}",
        f"Bottles:        {summary['bottle_count']:,}",
        f"Avg price:      ${summary['avg_price']:,.2f}",
    ]

    if summary["by_store"]:
        lines.append("")
        lines.append("By Store:")
        lines.append("-" * 40)
        lines.append(f"{'Store':<25} {'Total':>8} {'Qty':>5}")
        lines.append("-" * 40)
        for store_name, info in summary["by_store"].items():
            lines.append(
                f"{store_name[:25]:<25} ${info['total']:>7,.2f} {info['count']:>5}"
            )

    if summary["recent"]:
        lines.append("")
        lines.append("Recent Purchases:")
        lines.append("-" * 40)
        for row in summary["recent"]:
            date = row.get("PurchaseDate", "?")
            wine = row.get("Wine", "Unknown")
            price = row.get("Price", "?")
            qty = row.get("Quantity", "1")
            store_name = row.get("StoreName", "")
            lines.append(f"  {date}  {wine}")
            lines.append(f"    ${price} x{qty}" + (f" @ {store_name}" if store_name else ""))

    return "\n".join(lines)


@mcp.tool()
def get_wishlist(query: str | None = None) -> str:
    """View your CellarTracker wishlist wines.

    Optionally search by wine name, region, or varietal.
    """
    paths = _get_fresh_paths()
    tag_rows = load_table(paths["Tag"])

    # Filter to wishlist entries (CT convention: ListName starts with *)
    wishlist = [r for r in tag_rows if r.get("ListName", "") == "*Wishlist"]

    if query:
        # Search across multiple fields
        filtered = []
        term = query.lower()
        for row in wishlist:
            searchable = " ".join(
                row.get(f, "") for f in ("Wine", "WineName", "Region", "Varietal", "Country")
            ).lower()
            if term in searchable:
                filtered.append(row)
        wishlist = filtered

    if not wishlist:
        return "No wishlist wines found" + (f" matching '{query}'." if query else ".")

    lines = [f"Wishlist — {len(wishlist)} wine(s):", ""]
    for row in wishlist:
        wine = row.get("Wine", row.get("WineName", "Unknown"))
        vintage = row.get("Vintage", "NV")
        notes = row.get("WinesNotes", row.get("Notes", "")).strip()
        max_price = row.get("MaxPrice", row.get("Price", "")).strip()

        lines.append(f"  {vintage} {wine}")
        if notes:
            lines.append(f"    Notes: {notes}")
        if max_price:
            lines.append(f"    Max price: ${max_price}")
        lines.append("")

    return "\n".join(lines)


@mcp.tool()
def refresh_data() -> str:
    """Force refresh all CellarTracker data from the server.

    Downloads fresh CSV exports for all 8 tables regardless of cache age.
    """
    username, password = get_credentials()
    cache_dir = get_cache_dir()
    paths = export_all(username, password, cache_dir)

    # Count rows in each table
    lines = [
        f"Data refreshed at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        "",
    ]
    for table_name, path in paths.items():
        rows = load_table(path)
        desc = TABLES[table_name]["desc"]
        lines.append(f"  {table_name:<15} {len(rows):>6} rows  ({desc})")

    return "\n".join(lines)


def main():
    """Run the CellarTracker MCP server."""
    mcp.run()
