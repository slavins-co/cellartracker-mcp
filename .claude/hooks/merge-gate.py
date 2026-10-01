#!/usr/bin/env python3
"""Merge gate for cloud sessions (PreToolUse).

Refuses PR merges, force-pushes, tag pushes, releases and package publishes, whether
attempted through the shell or through a GitHub tool. Those belong to the maintainer.
Runs only when CLAUDE_CODE_REMOTE is set; local sessions are governed by the
maintainer's own setup. Accident prevention, not a security boundary.
"""
import json, os, re, sys

GATED = [
    ("merge a PR",        re.compile(r"\bgh\s+pr\s+merge\b")),
    ("merge a PR",        re.compile(r"\bgh\s+api\b.*pulls/\d+/merge\b")),
    ("create a release",  re.compile(r"\bgh\s+release\s+create\b")),
    ("publish a package", re.compile(r"\b(npm|pnpm|yarn)\s+(npm\s+)?publish\b")),
]
PUSH = re.compile(r"""\bgit\b(?:\s+-C\s+(?:"[^"]*"|'[^']*'|\S+))?\s+push\b(.*)""")
FORCE = re.compile(r"(\s--force(-with-lease|-if-includes)?\b|\s-(?!-)[A-Za-z]*f[A-Za-z]*\b|\s\+\S)")
TAGS = re.compile(r"(\s--tags\b|\s--follow-tags\b|refs/tags/|\stag\s)")
GATED_TOOLS = re.compile(r"(merge_pull_request|enable_auto_merge|create_release|publish_release|create_tag)", re.I)


def deny(action):
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": (
            f"merge gate: '{action}' belongs to the maintainer and is refused in cloud sessions. "
            "Don't retry or work around it. Leave the PR open and list this step for the maintainer."),
    }}))
    sys.exit(0)


def segments(cmd):
    return [s for s in re.split(r"&&|\|\||;|\n|(?<!>)\|", cmd) if s.strip()]


def gated_action(cmd):
    for seg in segments(cmd):
        for label, rx in GATED:
            if rx.search(seg):
                return label
        m = PUSH.search(seg)
        if m:
            rest = m.group(1)
            if FORCE.search(rest):
                return "force-push"
            if TAGS.search(rest):
                return "push tags"
    return None


def main():
    if not os.environ.get("CLAUDE_CODE_REMOTE"):
        sys.exit(0)
    data = json.load(sys.stdin)
    tool = data.get("tool_name", "")
    if tool.startswith("mcp__") and GATED_TOOLS.search(tool):
        deny(tool.split("__")[-1])
    if tool != "Bash":
        sys.exit(0)
    action = gated_action((data.get("tool_input") or {}).get("command", "") or "")
    if action:
        deny(action)
    sys.exit(0)


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception:
        sys.exit(0)
