"""Planner node — calls the LLM to decompose the task into ordered steps.

Reads `state.task` and the live tool registry summary, sends them to the LLM,
and parses the response into a list[str] of tagged steps. Each step carries a
[tool_name] prefix so the executor knows which tool to load, or [reason] for
pure LLM steps. Returns the new plan and flips status to "executing".
"""

import re

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI

import config
from prompts import load_prompt
from state import AgentState
from tools import registry_summary

_llm = ChatOpenAI(
    base_url=config.LLM_BASE_URL,
    api_key=config.LLM_API_KEY,
    model=config.LLM_MODEL,
    temperature=0.2,  # low temp: deterministic step list, not creative
)

# Loaded once at import time; {tools} placeholder filled at call time so the
# prompt always reflects the live registry — no stale hardcoding.
_SYSTEM_TEMPLATE = load_prompt("planner")


def _parse_steps(text: str) -> list[str]:
    """Strip numbering from LLM response, keep the [prefix] + step text."""
    lines = text.strip().splitlines()
    return [
        re.sub(r"^\d+[\.\)]\s*", "", line).strip()
        for line in lines
        if line.strip()
    ]


def planner(state: AgentState) -> dict:
    """LangGraph node: generate a tool-tagged plan from state.task.

    Returns:
        Partial state update: plan, status="executing", appended AI message.
    """
    system_prompt = _SYSTEM_TEMPLATE.format(tools=registry_summary())

    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=state["task"]),
    ]

    response = _llm.invoke(messages)
    steps = _parse_steps(response.content)

    return {
        "plan": steps,
        "status": "executing",
        "messages": [AIMessage(content=response.content)],
    }
