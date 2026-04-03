"""Classifier node — intent router, one LLM call, no side effects.

Decides whether the user's task requires the full research pipeline
(planner -> executor -> synthesiser) or can be answered directly (chat node).

Returns either:
  {"status": "planning"}  -> supervisor routes to planner
  {"status": "chatting"}  -> supervisor routes to chat

Why a separate node instead of logic in supervisor:
  Supervisor is a zero-LLM pure router — that invariant makes it trivially
  testable and reasonably fast. Breaking it by adding an LLM call there
  would make every routing decision slow and impure. Classifier stays
  separate so it can be tested, swapped, or skipped independently.

Why temperature=0:
  We want a deterministic binary decision, not a creative response.
  Temperature 0 collapses the distribution to the most likely token.
"""

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI

import config
from state import AgentState

_llm = ChatOpenAI(
    base_url=config.LLM_BASE_URL,
    api_key=config.LLM_API_KEY,
    model=config.LLM_MODEL,
    temperature=0,  # binary decision — no creativity needed
)

# System prompt is intentionally minimal. Fewer words = less chance of
# the model elaborating instead of returning the single expected word.
_SYSTEM = (
    "You are an intent classifier. "
    "Reply with exactly one word — no punctuation, no explanation.\n"
    "Reply 'chat' if the input is: a greeting, small talk, a simple factual question "
    "answerable from general knowledge, or anything conversational.\n"
    "Reply 'research' if the input requires: web search, live data, multi-step "
    "analysis, code execution, or any tool use."
)


def classifier(state: AgentState) -> dict:
    """LangGraph node: classify task intent as 'chat' or 'research'.

    Returns:
        Partial state update with status="chatting" or status="planning".
    """
    response = _llm.invoke([
        SystemMessage(content=_SYSTEM),
        HumanMessage(content=state["task"]),
    ])

    # Normalise: strip whitespace, lowercase, default to research on ambiguity.
    # Defaulting to research is safer than defaulting to chat — worst case the
    # user gets a thorough answer; the opposite failure is a shallow one.
    intent = response.content.strip().lower()
    new_status = "chatting" if intent == "chat" else "planning"

    return {"status": new_status}
