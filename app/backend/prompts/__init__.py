"""Prompt loader — reads system prompt markdown files from this directory.

Prompts live as plain .md files so they can be edited without touching node
logic. The {placeholders} syntax (e.g. {tools} in planner.md) is left to the
caller to fill in via str.format().
"""

from pathlib import Path

_DIR = Path(__file__).parent


def load_prompt(name: str) -> str:
    """Return the text of prompts/<name>.md, stripped of trailing whitespace."""
    return (_DIR / f"{name}.md").read_text().rstrip()
