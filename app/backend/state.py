"""Shared state schema for the FRIDAY multi-agent graph.

Every node in the graph reads from and writes to this single object.
Keeping state in one place means nodes stay stateless functions — easier
to test, swap out, or run in parallel later.
"""

from typing import Annotated, Any

from langgraph.graph.message import add_messages
from typing_extensions import TypedDict


class AgentState(TypedDict):
    # Annotated[list, add_messages] instead of just list[BaseMessage]:
    # LangGraph uses the reducer function (add_messages) to merge updates from
    # parallel nodes. Without it, two nodes writing to messages simultaneously
    # would overwrite each other. add_messages appends and deduplicates by ID.
    messages: Annotated[list, add_messages]

    # Separate from messages so nodes can read the raw task string without
    # parsing the full conversation history every time.
    task: str

    # list[str] with [tool_name] prefix per step, e.g. "[web_search] Find X".
    # Kept as strings (not dicts) so the schema stays flat and JSON-serialisable.
    # The prefix is the routing hint; executor strips it before sending to LLM.
    plan: list[str]

    # str not Enum — LangGraph serialises state to JSON for checkpointing.
    # A plain string survives that round-trip without custom serialisers.
    # Valid values: "planning" | "executing" | "synthesising" | "done" | "error"
    status: str

    # list[Any] not list[str] — different executor steps return different types
    # (search snippets, code output, API responses). Locking to str would force
    # lossy serialisation at this layer; better to let each consumer cast as needed.
    results: list[Any]

    # Separate from messages so the UI layer can subscribe to just these events
    # via SSE without filtering the full message stream. Phase 3 will drain this.
    ui_events: list[dict]
