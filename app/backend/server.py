"""FastAPI SSE server — wraps the FRIDAY agent graph for streaming HTTP access.

Why SSE over WebSocket: SSE is one-directional (server → client) and uses plain HTTP,
which means no special protocol negotiation. For a request/response agent pattern (user
sends a task, server streams progress back) it's a better fit than full-duplex WebSocket.

Why sse-starlette: it handles the SSE wire format (event:/data: frames, keep-alives,
client disconnect detection) so we only need to yield dicts from a generator.
"""

import json
import sys
from pathlib import Path

# graph.py uses bare imports: `from nodes.executor import executor`
# This must come before any local imports so Python finds the right packages.
sys.path.insert(0, str(Path(__file__).parent))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from graph import graph  # noqa: E402 — import after sys.path patch
from config import FRONTEND_ORIGINS  # noqa: E402

app = FastAPI(title="FRIDAY API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=FRONTEND_ORIGINS,  # sourced from FRONTEND_ORIGINS in .env
    allow_methods=["POST", "OPTIONS"],
    allow_headers=["*"],
)


class RunRequest(BaseModel):
    task: str


def _events_from_updates(data: dict, ctx: dict) -> list[dict]:
    """Translate one v2 'updates' chunk into typed SSE event dicts.

    ctx carries mutable state across chunks:
      full_plan: list[str]  — saved from planner output, never modified
      remaining: list[str]  — plan remainder from the latest executor chunk

    Each returned dict: {"event": str, "data": str (JSON)}

    node_start events are emitted BEFORE the completion event of the same chunk.
    Rationale: graph.stream() yields a chunk after a node finishes. We use that
    arrival as the signal that the *next* node is about to start, so "node_start"
    is semantically "next node beginning" not "this node done".
    """
    events = []

    if "classifier" in data:
        # Classifier decided the intent — announce the next node.
        new_status = data["classifier"].get("status", "planning")
        intent = "chatting" if new_status == "chatting" else "planning"
        next_node = "chat" if intent == "chatting" else "planner"
        events.append({"event": "classifier_result", "data": json.dumps({"intent": intent})})
        events.append({"event": "node_start", "data": json.dumps({"node": next_node})})

    if "planner" in data:
        plan = data["planner"].get("plan", [])
        ctx["full_plan"] = plan
        ctx["remaining"] = plan  # executor will shrink this
        # planner done → executor step 0 is starting
        events.append({"event": "node_start", "data": json.dumps({"node": "executor", "step_index": 0})})
        events.append({"event": "plan", "data": json.dumps({"steps": plan})})

    if "executor" in data:
        full = ctx.get("full_plan", [])
        remaining = data["executor"].get("plan", [])
        results = data["executor"].get("results", [])

        # Which step just finished: index = total - remaining - 1
        # e.g. full=3 remaining=2 → idx=0 (first step done)
        done_idx = len(full) - len(remaining) - 1
        done_step = full[done_idx] if 0 <= done_idx < len(full) else ""
        preview = str(results[-1])[:200] if results else ""

        ctx["remaining"] = remaining

        # Announce what starts next before emitting the step completion
        if remaining:
            next_idx = done_idx + 1
            events.append({"event": "node_start", "data": json.dumps({"node": "executor", "step_index": next_idx})})
        else:
            events.append({"event": "node_start", "data": json.dumps({"node": "synthesiser"})})

        events.append({
            "event": "step_done",
            "data": json.dumps({"index": done_idx, "step": done_step, "result_preview": preview}),
        })

    # chat and synthesiser emit UI components via get_stream_writer() which arrives
    # as chunk["type"] == "custom" — handled in _stream_events below.
    # Do NOT read their ui_events here — that fires a second `answer` event and
    # causes the frontend to render the component twice.

    return events


def _stream_events(task: str):
    """Sync generator yielding SSE event dicts for sse-starlette.

    sse-starlette runs sync generators in a thread pool, so this does not
    block the FastAPI event loop even though graph.stream() is synchronous.

    Why stream_mode=["updates", "custom"] + version="v2":
      - "updates" gives us node state deltas (same data as before, cleaner format)
      - "custom" gives us events emitted by get_stream_writer() inside nodes —
        this is how synthesiser/chat push typed UI component payloads mid-execution
        without coupling node return values to the UI contract
      - version="v2" unifies the chunk format to {"type", "ns", "data"} so we can
        distinguish stream modes by chunk["type"] instead of inspecting tuple shapes
    """
    initial_state = {
        "task": task,
        "messages": [],
        "plan": [],
        "status": "",  # empty string — supervisor cold-start routes to classifier
        "results": [],
        "ui_events": [],
    }
    ctx: dict = {"full_plan": [], "remaining": []}
    try:
        # Announce classifier as the first active node before any chunk arrives.
        # Every fresh request passes through classifier first.
        yield {"event": "node_start", "data": json.dumps({"node": "classifier"})}
        for chunk in graph.stream(
            initial_state,
            stream_mode=["updates", "custom"],
            version="v2",
        ):
            if chunk["type"] == "updates":
                # State delta from a completed node — drive flow panel progress events
                for ev in _events_from_updates(chunk["data"], ctx):
                    yield ev
            elif chunk["type"] == "custom":
                # UI component event emitted by get_stream_writer() inside a node.
                # Payload shape: {"name": "<ComponentName>", "props": {...}}
                yield {"event": "component", "data": json.dumps(chunk["data"])}
        yield {"event": "done", "data": "{}"}
    except Exception as exc:
        yield {"event": "error", "data": json.dumps({"message": str(exc)})}


@app.post("/api/run")
async def run(req: RunRequest):
    """Stream agent execution as SSE.

    The client POSTs {"task": "..."} and receives a stream of typed events
    until the graph finishes or errors. See _events_from_chunk for the event
    vocabulary.
    """
    return EventSourceResponse(_stream_events(req.task))
