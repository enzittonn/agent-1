"""Chat node — direct LLM answer for conversational tasks.

Handles tasks that the classifier routed as 'chat' intent: greetings,
simple factual Q&A, small talk. No tools, no plan, one LLM call.

Uses get_stream_writer() to emit an AnswerCard component event, matching
the synthesiser's prose path. Both arrive at the frontend as a `component`
SSE event with name="AnswerCard", so the registry dispatches them identically.

Why not reuse the synthesiser node:
  Synthesiser reads state.results and state.task to narrate research output.
  For chat there are no results — feeding an empty results list would
  confuse its prompt and waste an LLM call constructing a narration wrapper
  around nothing. A lean dedicated node is cleaner.
"""

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langgraph.config import get_stream_writer

import config
from state import AgentState

_llm = ChatOpenAI(
    base_url=config.LLM_BASE_URL,
    api_key=config.LLM_API_KEY,
    model=config.LLM_MODEL,
    temperature=0.7,  # conversational — some warmth is appropriate here
)

_SYSTEM = (
    "You are FRIDAY, a helpful and concise AI assistant. "
    "Answer directly and naturally. "
    "Do not use bullet points or headers unless the question genuinely calls for structure. "
    "Keep responses brief for greetings and small talk."
)


def chat(state: AgentState) -> dict:
    """LangGraph node: answer a conversational task directly.

    Emits an AnswerCard component event via the stream writer, then returns
    the state update. The ui_events field is kept as a backward-compat fallback
    for when the writer is unavailable (e.g. direct node invocation in tests).
    """
    writer = get_stream_writer()

    response = _llm.invoke([
        SystemMessage(content=_SYSTEM),
        HumanMessage(content=state["task"]),
    ])

    answer = response.content

    # Emit AnswerCard — same component as synthesiser's prose path,
    # so the frontend renders chat and research responses identically.
    writer({"name": "AnswerCard", "props": {"content": answer}})

    return {
        "status": "done",
        "ui_events": [{"type": "answer", "content": answer}],
        "messages": [AIMessage(content=answer)],
    }
