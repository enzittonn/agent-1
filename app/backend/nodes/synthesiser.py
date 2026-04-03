"""Synthesiser node — turns raw executor results into structured UI output.

This is the only node that decides what the user sees. It:
  - Reads all state.results (raw strings from executor steps)
  - Reads state.task (the original user question)
  - Decides which React component to render based on the query type
  - Emits a typed UI component event via get_stream_writer() for the frontend
  - Sets status = "done"

Component dispatch logic:
  - Weather queries → WeatherCard (structured props extracted via LLM)
  - All other queries → AnswerCard (markdown prose)

Why get_stream_writer() instead of ui_events state field:
  LangGraph's stream_mode="custom" receives writer() calls as they happen,
  decoupling the UI payload from the node's return value. This matches the
  pattern from the official LangGraph streaming docs and allows future
  streaming updates (e.g. partial WeatherCard while data loads).
"""

from typing import Optional
from typing_extensions import TypedDict

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langgraph.config import get_stream_writer

import config
from prompts import load_prompt
from state import AgentState

_llm = ChatOpenAI(
    base_url=config.LLM_BASE_URL,
    api_key=config.LLM_API_KEY,
    model=config.LLM_MODEL,
    temperature=0.5,  # slightly higher than executor — we want a clear, readable narrative
)

_SYSTEM_PROMPT = load_prompt("synthesiser")

# Keywords that indicate the query is weather-related.
# Checked against the task string (lowercase) before deciding component type.
_WEATHER_KEYWORDS = {"weather", "temperature", "forecast", "rain", "snow", "humidity",
                     "wind", "clima", "celsius", "fahrenheit", "feels like"}


class WeatherProps(TypedDict):
    """Structured weather data extracted from research findings for WeatherCard."""
    city: str
    condition: str           # e.g. "Light rain"
    temp_c: float
    feels_like_c: float
    humidity: int            # percentage 0-100
    wind_speed_kmh: float
    wind_direction: str      # e.g. "Northeast"
    aqi: Optional[int]       # Air Quality Index, None if not available
    aqi_label: Optional[str] # e.g. "Good", "Moderate"
    visibility_km: Optional[float]
    summary: str             # 1-2 sentence plain-language description


def _is_weather_query(task: str) -> bool:
    """Heuristic check — avoids a second LLM call just to classify."""
    task_lower = task.lower()
    return any(kw in task_lower for kw in _WEATHER_KEYWORDS)


def _build_user_message(task: str, results: list) -> str:
    """Format the task + results into a single prompt for the synthesiser."""
    findings = "\n\n".join(
        f"### Finding {i + 1}\n{r}" for i, r in enumerate(results)
    )
    return f"User question: {task}\n\n---\n\nResearch findings:\n\n{findings}"


def synthesiser(state: AgentState) -> dict:
    """LangGraph node: synthesise executor results into a typed UI component.

    Emits a UI component event via the LangGraph stream writer before returning.
    The SSE server forwards this as a `component` event to the frontend.

    Returns:
        Partial state update: status="done", messages appended.
        ui_events is also populated for backward-compat fallback in server.py.
    """
    writer = get_stream_writer()
    task = state["task"]
    results = state["results"]

    if _is_weather_query(task):
        # Extract structured weather data so the frontend can render a rich card
        # instead of markdown prose. with_structured_output uses JSON schema
        # coercion — the LLM fills in whatever fields the results contain.
        extraction_llm = _llm.with_structured_output(WeatherProps)
        prompt = (
            f"Extract weather data from these research findings for the query: {task}\n\n"
            + "\n\n".join(str(r) for r in results)
            + "\n\nFor any field not present in the findings, use null."
        )
        try:
            props: WeatherProps = extraction_llm.invoke([
                HumanMessage(content=prompt)
            ])
            writer({"name": "WeatherCard", "props": props})
            answer_text = props.get("summary", f"Weather data for {props.get('city', 'your location')}")
        except Exception:
            # Fall back to prose if structured extraction fails
            props = None

        if props is None:
            # Structured extraction failed — fall through to prose path
            pass
        else:
            return {
                "status": "done",
                "ui_events": state["ui_events"] + [{"type": "answer", "content": answer_text}],
                "messages": [AIMessage(content=answer_text)],
            }

    # Default path: prose markdown answer via AnswerCard
    messages = [
        SystemMessage(content=_SYSTEM_PROMPT),
        HumanMessage(content=_build_user_message(task, results)),
    ]
    response = _llm.invoke(messages)
    answer = response.content

    # Emit the component event — the SSE server forwards this to the frontend.
    # AnswerCard accepts a `content` prop (markdown string).
    writer({"name": "AnswerCard", "props": {"content": answer}})

    # ui_events fallback: server.py reads this if the writer path is unavailable
    # (e.g. when called outside a streaming context in tests).
    return {
        "status": "done",
        "ui_events": state["ui_events"] + [{"type": "answer", "content": answer}],
        "messages": [AIMessage(content=answer)],
    }
