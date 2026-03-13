"""CSV query engine for CellarTracker data. Stdlib only — no pandas."""

import csv
from collections import defaultdict
from pathlib import Path


def load_table(csv_path: Path) -> list[dict]:
    """Load a CSV file into a list of dicts via csv.DictReader."""
    with open(csv_path, encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def search(rows: list[dict], filters: dict) -> list[dict]:
    """Case-insensitive substring match on column values.

    Example: search(rows, {"Color": "red", "Region": "burg"})
    matches Color="Red" and Region="Burgundy".
    """
    if not filters:
        return rows

    results = []
    for row in rows:
        match = True
        for col, term in filters.items():
            if term is None:
                continue
            cell = row.get(col, "")
            if term.lower() not in cell.lower():
                match = False
                break
        if match:
            results.append(row)
    return results


def aggregate(rows: list[dict], group_by: str) -> dict[str, int]:
    """Count rows grouped by a column value."""
    counts = defaultdict(int)
    for row in rows:
        key = row.get(group_by, "").strip() or "(unknown)"
        counts[key] += 1
    return dict(sorted(counts.items(), key=lambda x: -x[1]))


def cross_reference(
    primary: list[dict], secondary: list[dict], key: str = "iWine"
) -> list[dict]:
    """Join primary and secondary rows via a shared key field.

    Builds a lookup dict from secondary, then merges fields into copies of
    primary rows. O(n+m) complexity.
    """
    lookup = {}
    for row in secondary:
        k = row.get(key, "")
        if k:
            lookup[k] = row

    merged = []
    for row in primary:
        combined = dict(row)
        k = row.get(key, "")
        if k and k in lookup:
            for col, val in lookup[k].items():
                if col not in combined or not combined[col]:
                    combined[col] = val
        merged.append(combined)
    return merged


def _safe_float(value: str, default: float = -1.0) -> float:
    """Parse a float from a string, returning default on failure."""
    if not value or not value.strip():
        return default
    try:
        return float(value.strip())
    except (ValueError, TypeError):
        return default


def _safe_int(value: str, default: int = 0) -> int:
    """Parse an int from a string, returning default on failure."""
    if not value or not value.strip():
        return default
    try:
        return int(float(value.strip()))
    except (ValueError, TypeError):
        return default


def drinking_priority(
    list_rows: list[dict], avail_rows: list[dict], current_year: int
) -> list[dict]:
    """Cross-reference List + Availability and sort by drinking urgency.

    Priority tiers:
      1. Available > 1.0 (past peak) — most past-peak first
      2. EndConsume <= current_year (window closing) — earliest closing first
      3. Available 0.7–1.0 (in window)
      4. Available 0.3–0.7 (approaching)
      5. No data → end of list
    """
    merged = cross_reference(list_rows, avail_rows, key="iWine")

    def sort_key(row: dict) -> tuple:
        avail = _safe_float(row.get("Available", ""), -1.0)

        # Try Availability table fields first, fall back to List table
        end_consume = _safe_int(row.get("EndConsume", ""), 0)
        if not end_consume:
            end_consume = _safe_int(row.get("EndDrink", ""), 0)

        # Tier assignment
        if avail > 1.0:
            return (0, -avail, end_consume)  # Tier 1: past peak, most urgent first
        elif end_consume and end_consume <= current_year:
            return (1, end_consume, -avail)  # Tier 2: window closing
        elif 0.7 <= avail <= 1.0:
            return (2, -avail, end_consume)  # Tier 3: in window
        elif 0.3 <= avail < 0.7:
            return (3, -avail, end_consume)  # Tier 4: approaching
        else:
            return (4, 0, 0)                 # Tier 5: no data

    merged.sort(key=sort_key)
    return merged


def spend_summary(
    purchase_rows: list[dict],
    date_from: str | None = None,
    date_to: str | None = None,
) -> dict:
    """Compute spending summary from purchase rows.

    Returns: total spent, count, avg price, by_store breakdown, recent 10 purchases.
    """
    # Filter by date range if provided
    filtered = purchase_rows
    if date_from:
        filtered = [r for r in filtered if r.get("PurchaseDate", "") >= date_from]
    if date_to:
        filtered = [r for r in filtered if r.get("PurchaseDate", "") <= date_to]

    total = 0.0
    count = 0
    by_store: dict[str, dict] = defaultdict(lambda: {"total": 0.0, "count": 0})

    for row in filtered:
        price = _safe_float(row.get("Price", ""), 0.0)
        qty = _safe_int(row.get("Quantity", ""), 1)
        line_total = price * qty
        if price > 0:
            total += line_total
            count += qty
            store = row.get("StoreName", "").strip() or "(unknown)"
            by_store[store]["total"] += line_total
            by_store[store]["count"] += qty

    avg_price = total / count if count > 0 else 0.0

    # Recent purchases (last 10 by date)
    sorted_purchases = sorted(
        filtered, key=lambda r: r.get("PurchaseDate", ""), reverse=True
    )
    recent = sorted_purchases[:10]

    return {
        "total_spent": round(total, 2),
        "bottle_count": count,
        "avg_price": round(avg_price, 2),
        "by_store": {
            store: {"total": round(info["total"], 2), "count": info["count"]}
            for store, info in sorted(by_store.items(), key=lambda x: -x[1]["total"])
        },
        "recent": recent,
    }
