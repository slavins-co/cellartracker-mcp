"""Credential and path management for CellarTracker MCP."""

import logging
import os
import stat
from pathlib import Path

logger = logging.getLogger(__name__)


def _load_env_file(path: Path) -> dict:
    """Parse key=value pairs from a .env file. Skips comments and blank lines."""
    env = {}
    if not path.is_file():
        return env
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip()
        # Strip surrounding quotes if present
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ('"', "'"):
            value = value[1:-1]
        env[key] = value
    return env


def get_credentials() -> tuple[str, str]:
    """Load CellarTracker username and password.

    Resolution order:
      1. CT_USERNAME / CT_PASSWORD environment variables
      2. .env file in current working directory
      3. ~/.config/cellartracker-mcp/.env
      4. Raise with clear error message
    """
    # Check env vars first
    username = os.environ.get("CT_USERNAME")
    password = os.environ.get("CT_PASSWORD")
    if username and password:
        return username, password

    # Try .env files in order
    env_paths = [
        Path.cwd() / ".env",
        Path.home() / ".config" / "cellartracker-mcp" / ".env",
    ]
    for env_path in env_paths:
        env = _load_env_file(env_path)
        username = env.get("CT_USERNAME")
        password = env.get("CT_PASSWORD")
        if username and password:
            file_mode = env_path.stat().st_mode
            if file_mode & (stat.S_IRGRP | stat.S_IROTH):
                logger.warning(
                    "Credential file %s is readable by other users. "
                    "Run: chmod 600 %s",
                    env_path, env_path,
                )
            return username, password

    raise RuntimeError(
        "CellarTracker credentials not found. Set CT_USERNAME and CT_PASSWORD via:\n"
        "  - Environment variables\n"
        "  - .env file in current directory\n"
        "  - ~/.config/cellartracker-mcp/.env"
    )


def get_cache_dir() -> Path:
    """Return the cache directory for CSV exports.

    Default: ~/.cache/cellartracker-mcp/exports/
    Override via CT_CACHE_DIR environment variable.
    """
    override = os.environ.get("CT_CACHE_DIR")
    if override:
        cache_dir = Path(override)
    else:
        cache_dir = Path.home() / ".cache" / "cellartracker-mcp" / "exports"
    created = not cache_dir.exists()
    cache_dir.mkdir(parents=True, exist_ok=True)
    if created:
        os.chmod(cache_dir, 0o700)
    return cache_dir
