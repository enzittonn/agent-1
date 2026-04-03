"""Supervisor node — pure router, zero side effects.

Reads state.status and returns the name of the next node. That's it.
No LLM calls, no state mutations, no business logic.

Routing table:
  "done" / "error"   → END
  "synthesising"     → "synthesiser"
  "executing"        → "executor"
  "planning"         → "planner"
  "chatting"         → "chat"
  "" (empty/cold)    → "classifier"  (first node in every fresh request)
  anything else      → "classifier" (safe default)
"""

from langgraph.graph import END

from state import AgentState


def supervisor(state: AgentState) -> str:
    """Route to the appropriate node based on current state.status."""
    status = state.get("status", "")

    if status in ("done", "error"):
        return END

    if status == "synthesising":
        return "synthesiser"

    if status == "executing":
        return "executor"

    if status == "planning":
        return "planner"

    if status == "chatting":
        return "chat"

    # Empty status = cold start (fresh request). Route to classifier first so
    # every task gets intent-checked. This is the ReAct entry point.
    return "classifier"
