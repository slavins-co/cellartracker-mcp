"""CellarTracker CSV export and cache management."""

import os
import shutil
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path

BASE_URL = "https://www.cellartracker.com/xlquery.asp"

TABLES = {
    "List":         {"params": {"Table": "List", "Location": "1"}, "desc": "Current cellar inventory"},
    "Notes":        {"params": {"Table": "Notes"},                 "desc": "Tasting notes"},
    "Purchase":     {"params": {"Table": "Purchase"},              "desc": "Purchase history"},
    "Consumed":     {"params": {"Table": "Consumed"},              "desc": "Consumed wines"},
    "Availability": {"params": {"Table": "Availability"},          "desc": "Drinking windows & pro scores"},
    "Tag":          {"params": {"Table": "Tag"},                   "desc": "Wishlists & custom lists"},
    "Bottles":      {"params": {"Table": "Bottles"},               "desc": "Individual bottle records"},
    "Pending":      {"params": {"Table": "Pending"},               "desc": "Pending/in-transit orders"},
}


def fetch_table(user: str, password: str, extra_params: dict) -> str:
    """Fetch a single table from CellarTracker as CSV text.

    Uses windows-1252 decoding (CellarTracker default) and normalizes line endings.
    """
    params = {"User": user, "Password": password, "Format": "csv", **extra_params}
    url = f"{BASE_URL}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read()
    except (urllib.error.URLError, OSError) as e:
        # Re-raise without the original chain to avoid leaking credentials
        # embedded in the URL query string via traceback
        table = extra_params.get("Table", "unknown")
        raise RuntimeError(
            f"Failed to fetch table '{table}' from CellarTracker: {type(e).__name__}"
        ) from None
    return raw.decode("windows-1252").replace("\r\n", "\n")


def _save_csv(csv_text: str, table_name: str, cache_dir: Path) -> Path:
    """Save CSV text with timestamp and update _latest symlink-style copy."""
    cache_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    timestamped = cache_dir / f"{table_name}_{timestamp}.csv"
    latest = cache_dir / f"{table_name}_latest.csv"

    timestamped.write_text(csv_text, encoding="utf-8")
    os.chmod(timestamped, 0o600)
    # Update latest as a plain copy (more portable than symlinks)
    # copy2 preserves permissions from timestamped (already 0o600)
    shutil.copy2(timestamped, latest)
    return latest


def _cleanup_old(table_name: str, cache_dir: Path, keep: int = 10) -> None:
    """Remove old timestamped CSVs, keeping the most recent `keep` files."""
    pattern = f"{table_name}_2*.csv"  # Matches timestamped files (start with year)
    files = sorted(cache_dir.glob(pattern), key=lambda p: p.name, reverse=True)
    for old_file in files[keep:]:
        old_file.unlink(missing_ok=True)


def export_table(username: str, password: str, table_name: str, cache_dir: Path) -> Path:
    """Export a single table from CellarTracker and save to cache.

    Returns the path to the _latest.csv file.
    """
    if table_name not in TABLES:
        raise ValueError(f"Unknown table '{table_name}'. Valid: {', '.join(TABLES)}")

    csv_text = fetch_table(username, password, TABLES[table_name]["params"])
    latest_path = _save_csv(csv_text, table_name, cache_dir)
    _cleanup_old(table_name, cache_dir)
    return latest_path


def export_all(username: str, password: str, cache_dir: Path) -> dict[str, Path]:
    """Export all 8 tables from CellarTracker.

    Returns a dict mapping table name to the _latest.csv path.
    """
    results = {}
    for table_name in TABLES:
        results[table_name] = export_table(username, password, table_name, cache_dir)
    return results


def get_cache_age(cache_dir: Path) -> timedelta | None:
    """Check the age of the newest _latest.csv in the cache directory.

    Returns None if no cached files exist.
    """
    latest_files = list(cache_dir.glob("*_latest.csv"))
    if not latest_files:
        return None
    newest = max(latest_files, key=lambda p: p.stat().st_mtime)
    age_seconds = datetime.now().timestamp() - newest.stat().st_mtime
    return timedelta(seconds=age_seconds)


def ensure_fresh(
    username: str, password: str, cache_dir: Path, max_age_hours: int = 24
) -> dict[str, Path]:
    """Export all tables only if cache is older than max_age_hours.

    Always returns a dict mapping table name to the _latest.csv path.
    """
    age = get_cache_age(cache_dir)
    if age is None or age > timedelta(hours=max_age_hours):
        return export_all(username, password, cache_dir)

    # Cache is fresh — return existing latest paths
    results = {}
    for table_name in TABLES:
        latest = cache_dir / f"{table_name}_latest.csv"
        if latest.is_file():
            results[table_name] = latest
    # If any table is missing, re-export everything
    if len(results) < len(TABLES):
        return export_all(username, password, cache_dir)
    return results
