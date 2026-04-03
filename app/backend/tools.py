"""Tool registry — central catalogue of available agent capabilities.

Each entry describes a tool with enough metadata to reason about relevance
(name, description, tags) plus a lazy loader that returns the live tool
object only when actually needed.

Adding a new tool: append one dict to REGISTRY, implement its _load_* fn.
The executor searches this registry per step and binds only relevant tools.
"""

import os
from typing import Callable

from langchain_core.tools import BaseTool


# ---------------------------------------------------------------------------
# Loaders — called only when a tool is actually needed for a step
# ---------------------------------------------------------------------------

def _load_web_search() -> BaseTool:
    """Load Tavily web search. Raises if API key is missing."""
    from langchain_tavily import TavilySearch
    return TavilySearch(max_results=5)


# ---------------------------------------------------------------------------
# Registry — name, description, tags, loader
# ---------------------------------------------------------------------------

REGISTRY: list[dict] = [
    {
        "name": "web_search",
        "description": "Search the web for current or factual information about any topic",
        # Tags are matched against step text for relevance scoring.
        "tags": ["search", "web", "research", "find", "look up", "facts", "latest", "current"],
        # Availability guard — don't list tools the system can't actually use.
        "available": bool(os.getenv("TAVILY_API_KEY")),
        "loader": _load_web_search,
    },
    # Future entries:
    # {"name": "code_runner", "description": "...", "tags": [...], "loader": _load_code_runner},
    # {"name": "file_reader", "description": "...", "tags": [...], "loader": _load_file_reader},
]


# ---------------------------------------------------------------------------
# Runtime search — keyword/tag match, returns loaded tools
# ---------------------------------------------------------------------------

def find_tools(step: str, top_k: int = 3) -> list[BaseTool]:
    """Search the registry for tools relevant to the given step text.

    Scores each available tool by counting how many of its tags appear in the
    (lowercased) step string. Returns the top-k scorers with score > 0,
    fully loaded. Returns [] when nothing matches — caller uses plain LLM.

    Args:
        step: The current plan step text (natural language).
        top_k: Max tools to return.

    Returns:
        List of loaded BaseTool instances, highest-scoring first.
    """
    step_lower = step.lower()
    scored: list[tuple[int, dict]] = []

    for entry in REGISTRY:
        if not entry["available"]:
            continue
        score = sum(1 for tag in entry["tags"] if tag in step_lower)
        if score > 0:
            scored.append((score, entry))

    # Sort descending by score, take top_k
    scored.sort(key=lambda x: x[0], reverse=True)
    return [entry["loader"]() for _, entry in scored[:top_k]]


def registry_summary() -> str:
    """Return a short description of available tools for the planner prompt.

    Only includes tools that are currently available (guard passed).
    Format: '- web_search: Search the web for current or factual information...'
    """
    lines = [
        f"- {e['name']}: {e['description']}"
        for e in REGISTRY
        if e["available"]
    ]
    return "\n".join(lines) if lines else "No external tools available."
