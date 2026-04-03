"""FRIDAY agent graph — wires all nodes into a compiled StateGraph.

Topology:
  Every node feeds back to the supervisor via a single shared edge.
  The supervisor is a conditional edge that reads state.status and
  dispatches to the right node or END.

  START → classifier → chat                         → END  (conversational)
                     → planner → executor (loop) → synthesiser → END  (research)

  Classifier is the mandatory entry point for every fresh request.
  Setting state.status="" triggers supervisor to route there first.
"""

from langgraph.graph import END, START, StateGraph

from nodes.chat import chat
from nodes.classifier import classifier
from nodes.executor import executor
from nodes.planner import planner
from nodes.supervisor import supervisor
from nodes.synthesiser import synthesiser
from state import AgentState

# ---------------------------------------------------------------------------
# Build graph
# ---------------------------------------------------------------------------

builder = StateGraph(AgentState)

# Register nodes — supervisor is a conditional edge function, not a node.
builder.add_node("classifier", classifier)
builder.add_node("chat", chat)
builder.add_node("planner", planner)
builder.add_node("executor", executor)
builder.add_node("synthesiser", synthesiser)

# Every node loops back through supervisor after each call.
# Supervisor reads state.status and returns the next destination.
# The path_map must be declared explicitly — LangGraph can't infer dynamic
# string returns from the supervisor function at graph-build time, so without
# this the edges don't appear in the diagram or internal graph structure.
_ROUTES = {
    "classifier": "classifier",
    "chat": "chat",
    "planner": "planner",
    "executor": "executor",
    "synthesiser": "synthesiser",
    END: END,
}

builder.add_conditional_edges(START, supervisor, _ROUTES)
builder.add_conditional_edges("classifier", supervisor, _ROUTES)
builder.add_conditional_edges("chat", supervisor, _ROUTES)
builder.add_conditional_edges("planner", supervisor, _ROUTES)
builder.add_conditional_edges("executor", supervisor, _ROUTES)
builder.add_conditional_edges("synthesiser", supervisor, _ROUTES)

# ---------------------------------------------------------------------------
# Compile — produces a runnable with .invoke() / .stream()
# ---------------------------------------------------------------------------

# checkpointer=None for now; add SqliteSaver/MemorySaver in Phase 3
# when we need persistent conversation state across requests.
graph = builder.compile()
