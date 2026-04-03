"""Executor node — runs one plan step per graph iteration.

Each call:
  1. Pops plan[0] (the current step, which carries a [tool_name] prefix)
  2. Searches the tool registry for relevant tools based on the step text
  3. Binds only those tools to the LLM for this call (no context bloat)
  4. Executes: LLM call + optional one-round tool use
  5. Appends raw result to state.results, shrinks plan

When the plan is empty after popping, sets status="synthesising" so the
supervisor hands off to the synthesiser node. Executor never narrates.
"""

import re

from langchain_core.messages import HumanMessage, SystemMessage, ToolMessage
from langchain_openai import ChatOpenAI

import config
from prompts import load_prompt
from state import AgentState
from tools import find_tools

_base_llm = ChatOpenAI(
    base_url=config.LLM_BASE_URL,
    api_key=config.LLM_API_KEY,
    model=config.LLM_MODEL,
    temperature=0.3,
)

_SYSTEM_PROMPT = load_prompt("executor")

# Matches the [tool_name] prefix the planner adds to each step.
_PREFIX_RE = re.compile(r"^\[[\w_]+\]\s*")


def executor(state: AgentState) -> dict:
    """LangGraph node: execute the next plan step.

    Returns:
        Partial state update: shrunk plan, appended raw result, updated status.
    """
    step = state["plan"][0]
    remaining = state["plan"][1:]

    # Strip the [prefix] tag — it was for routing, not for the LLM.
    step_text = _PREFIX_RE.sub("", step).strip()

    # Search registry: load only tools relevant to this specific step.
    tools = find_tools(step)  # uses full step string (incl. prefix) for tag matching
    llm = _base_llm.bind_tools(tools) if tools else _base_llm

    messages = [SystemMessage(content=_SYSTEM_PROMPT), HumanMessage(content=step_text)]
    response = llm.invoke(messages)

    # One round of tool execution if the LLM decided to call a tool.
    if getattr(response, "tool_calls", None) and tools:
        tool_map = {t.name: t for t in tools}
        messages.append(response)
        for tc in response.tool_calls:
            tool = tool_map.get(tc["name"])
            output = tool.invoke(tc["args"]) if tool else f"Tool '{tc['name']}' not found."
            messages.append(ToolMessage(content=str(output), tool_call_id=tc["id"]))
        # Synthesis call uses base LLM — no tools needed, avoids recursive tool calls.
        response = _base_llm.invoke(messages)

    return {
        "plan": remaining,
        "results": state["results"] + [response.content],
        # When plan is empty, hand off to synthesiser — never set "done" here.
        "status": "synthesising" if not remaining else "executing",
        "messages": [response],
    }
