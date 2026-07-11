# Security Policy

## Supported Versions

This project publishes a single npm package with no maintained release branches. Security fixes land in the latest release only — if you're pinned to an older version (per the README's version-pinning recommendation), upgrade to the newest release to pick up fixes.

## Reporting a Vulnerability

Please do not open a public GitHub issue for security vulnerabilities.

Instead, report privately via [GitHub Security Advisories](https://github.com/slavins-co/cellartracker-mcp/security/advisories/new). This opens a private discussion with the maintainer before any public disclosure.

## Credential Handling

CellarTracker has no OAuth, API keys, or scoped tokens — this server authenticates with your full CellarTracker account username and password. See the [Security & credentials](README.md#security--credentials) section of the README for how credentials are stored and protected, and what risks apply.
