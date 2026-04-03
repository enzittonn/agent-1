# FRIDAY — Roadmap

## Phase 1 — LangGraph StateGraph

| Step | File | Status |
|------|------|--------|
| 1.1 State schema | `state.py` | ✅ done |
| 1.2 Supervisor node | `nodes/supervisor.py` | ✅ done |
| 1.3 Planner node | `nodes/planner.py` | ✅ done |
| 1.4 Executor node | `nodes/executor.py` | ✅ done |
| 1.5 ~~Coder node~~ → Synthesiser node | `nodes/synthesiser.py` | ✅ done |
| 1.5a Tool registry | `tools.py` | ✅ done |
| 1.6 Wire StateGraph + streaming | `graph.py` | done |
| **1.7 ReAct intent router** | `nodes/classifier.py`, `nodes/chat.py`, `graph.py`, `server.py` | done |
| **3.9 FlowPanel per-node detail** | `FlowPanel.tsx`, `useAgentStream.ts`, `App.tsx`, `server.py` | done |
| **3.10 Generative UI component registry** | `server.py`, `synthesiser.py`, `chat.py`, `registry.tsx`, `WeatherCard.tsx`, `useAgentStream.ts`, `App.tsx` | done |

---

## Step logs

### 1.1 — State schema

#### Plan
Define a single `AgentState` TypedDict that all nodes share. Fields: `messages` (append-only via `add_messages`), `task`, `plan`, `status`, `results`, `ui_events`.

#### Result
`state.py` created. Six fields cover the full lifecycle: conversation history, the current task, the planner's step list, a status enum string, accumulated sub-agent results, and UI event payloads for Phase 3 streaming.

---

### 1.2 — Supervisor node

#### Plan
Pure routing function — reads `state.status` and `state.plan`, returns the next node name (or `END`). No LLM call, no state mutation.

#### Result
`nodes/supervisor.py` + `nodes/__init__.py` created (~22 lines). Routing: `done`/`error` → `END`, empty plan → `"planner"`, `executing` → `"executor"`, fallback → `"planner"`. Verified with inline Python and a Jupyter notebook (`tests/test_superviser.ipynb`).

---

### 1.3 — Planner node

#### Plan
Call local LLM with a strict system prompt asking for a numbered list. Parse the response into `list[str]` by stripping numbering prefixes. Return `{"plan": steps, "status": "executing", "messages": [AIMessage(...)]}`.

#### Result
`nodes/planner.py` created. Uses `ChatOpenAI` via `config.py` with `temperature=0.2`. Updated in the generalisation step to inject `registry_summary()` into the system prompt and prompt for `[tool]`-prefixed step output. `_parse_steps` strips numbering but preserves the prefix tag.

---

### 1.4 — Executor node

#### Plan
One call = one plan step. Pop `plan[0]`, invoke LLM with optional tool use. Append result to `state.results`, signal done when plan empty.

#### Result
`nodes/executor.py` created, then overhauled in the generalisation step. Now calls `find_tools(step)` from `tools.py` at runtime per step — tags in the step text are matched against the registry to load only relevant tools. Sets `status="synthesising"` (not `"done"`) when plan empties, handing off to the synthesiser. Test notebook at `tests/test_executor.ipynb`.

---

### 1.5 — Generalisation: tool registry + synthesiser node

#### Plan
Step back before implementing Coder node. Scope narrowed to explainer agent (ask question → web search → compile → render). Introduced two-layer tool registry (lean metadata for planner, full schema loaded on demand per step). Added Synthesiser as its own node owning all narration and UI output decisions.

#### Result
- `tools.py` — `REGISTRY` list with availability guard, tag-based `find_tools()`, `registry_summary()` for planner prompt injection.
- `nodes/synthesiser.py` — reads all `state.results` + `state.task`, produces structured markdown answer, emits `{"type": "answer", ...}` into `state.ui_events`, sets `status="done"`.
- `nodes/supervisor.py` — added `"synthesising"` → `"synthesiser"` route.
- `state.py` — updated comments: plan step format now `[tool] Step text`, status now includes `"synthesising"`.
- `tests/test_explainer.ipynb` — end-to-end: planner → executor loop → synthesiser, renders final answer as markdown.

---

### Node responsibilities (canonical reference)

| Node | Owns | Never does |
|------|------|-----------|
| **Supervisor** | Routing (status → next node) | LLM calls, state mutation |
| **Planner** | Task → tagged step list | Execution, routing, UI |
| **Executor** | Steps → raw results (one per call) | Narration, UI, final routing |
| **Synthesiser** | Raw results → structured UI output | Execution, routing, tool calls |

Graph flow:
```
planner → executor (loop) → synthesiser → END
              ↑___________↓
           (supervisor cycles while status="executing")
```

---

---

### 1.6 — Wire StateGraph + streaming

#### Result
`graph.py` created. All four nodes (planner, executor, synthesiser, supervisor) wired into a
`StateGraph` with conditional edges from every node back through the supervisor. The supervisor
reads `state.status` and dispatches to the correct next node or `END`. `server.py` compiles the
graph and calls `graph.stream()` inside an SSE generator — covered fully in step 3.7.

---

### 1.7 — ReAct intent router

#### Plan
Every input currently runs planner → executor → synthesiser regardless of content.
"Hello" should not generate a 3-step research plan.

Add two nodes:
- `classifier` — one cheap LLM call, replies `chat` or `research`, sets `status`.
- `chat` — direct LLM answer, same `ui_events` answer shape as synthesiser, sets `status="done"`.

Supervisor: cold-start (empty `status`) → `classifier`; `"chatting"` → `"chat"`.

New topology:
```
START → classifier → chat                           → END  (conversational)
                   → planner → executor loop → synthesiser → END  (research)
```

Key decisions:
- Classifier is its own node, not logic in supervisor. Supervisor must stay zero-LLM.
- `chat` emits `{"type": "answer", ...}` into `ui_events` — same shape as synthesiser so the
  frontend SSE handler needs zero changes.
- Cold-start signal is `status=""` (empty). Avoids adding a `"classifying"` status value.

#### Result
- `nodes/classifier.py` — one LLM call at temperature=0, returns `"chatting"` or `"planning"`.
  Defaults to `"planning"` on any ambiguous/unexpected response (safer than shallow chat).
- `nodes/chat.py` — direct answer at temperature=0.7, emits `{"type":"answer"}` ui_event,
  sets `status="done"`. Same shape as synthesiser so frontend zero-change.
- `nodes/supervisor.py` — added `"chatting"` -> `"chat"` and empty-status -> `"classifier"` routes.
  Dropped the old planner-as-default fallback.
- `graph.py` — registered classifier + chat, extended `_ROUTES`, added conditional edges.
- `server.py` — cold-start `status=""`, pre-loop `node_start: classifier`, new chunk handlers
  for `"classifier"` (announces next node) and `"chat"` (extracts answer event).
- `tests/test_react.ipynb` — 4 cells: invoke + stream for both paths. All PASS.
  Stream trace confirmed: `classifier -> chat` for "Hello", `classifier -> planner -> executor(x7) -> synthesiser` for research.

## Phase 2 — LiveKit Voice Pipeline

- STT: faster-whisper
- TTS: Kokoro or Piper
- LiveKit room pipeline

## Phase 3 — Generative UI

| Step | File(s) | Status |
|------|---------|--------|
| 3.1 FastAPI SSE server | `app/backend/server.py` | ✅ done |
| 3.2 React + Vite scaffold | `app/frontend/` | ✅ done |
| 3.3 useAgentStream hook | `src/hooks/useAgentStream.ts` | ✅ done |
| 3.4 Generative components | `PlanView`, `ExecutorProgress`, `AnswerCard` | ✅ done |
| 3.5 LiveKit Aura + layout | `AgentLayout.tsx` | ✅ done |
| 3.6 App integration | `App.tsx` | ✅ done |
| 3.7 node_start SSE events | `app/backend/server.py` | ✅ done |
| 3.8 FlowPanel real-time trace | `FlowPanel.tsx`, `useAgentStream.ts`, `App.tsx` | ✅ done |

---

### 3.1–3.6 — Generative UI (complete)

#### Plan
SSE-based generative UI: FastAPI backend streams typed events from `graph.stream()`,
React frontend renders components progressively as events arrive. LiveKit's
`AgentAudioVisualizerAura` shadcn component in the header responds to agent status.

#### Result
- `app/backend/server.py` — FastAPI with `POST /api/run` SSE endpoint. `_events_from_chunk`
  maps raw LangGraph state deltas to 5 typed events: `plan`, `step_done`, `answer`, `done`, `error`.
- `app/frontend/` — Vite + React + TypeScript + Tailwind CSS 4 + shadcn.
- `src/hooks/useAgentStream.ts` — fetch/ReadableStream SSE client (not EventSource — POST body
  required). Pure `applyEvent` reducer drives typed state machine.
- `src/components/PlanView.tsx` — plan checklist, strips `[tool]` prefix, animates pending → running → done.
- `src/components/ExecutorProgress.tsx` — pulsing step progress bar while agent runs.
- `src/components/AnswerCard.tsx` — react-markdown + remark-gfm rendered answer.
- `src/components/AgentLayout.tsx` — sticky header with `AgentAudioVisualizerAura` (size="sm"),
  maps agent status → LiveKit AgentState (`"thinking"` while running, `"idle"` otherwise).
  Phase 2 hook-in: add `audioTrack` prop when LiveKit room is connected.

**To run:**
```
# Terminal 1 — LLM server
bash server.sh

# Terminal 2 — FastAPI
cd app/backend && uvicorn server:app --reload --port 8000

# Terminal 3 — React dev
cd app/frontend && npm run dev
# Open http://localhost:5173
```

---

### 3.7 — node_start SSE events

#### Plan
Add `node_start` events to the SSE stream so the frontend knows which node is active.
`graph.stream()` yields chunks after a node completes — use that arrival as a trigger to
announce the next node starting. Emit `node_start: planner` before the loop, then
`node_start: executor/synthesiser` inside `_events_from_chunk` based on which chunk arrived.

#### Result
`app/backend/server.py` — 3 new `node_start` emission sites (~12 lines):
- Before the `for chunk` loop: `node_start: planner`
- Inside `if "planner" in chunk`: `node_start: executor, step_index: 0`
- Inside `if "executor" in chunk`: `node_start: executor, step_index: N+1` or `node_start: synthesiser`

---

### 3.8 — FlowPanel real-time trace

#### Plan
Frontend panel showing each node as a row: active (blue pulsing dot, ticking elapsed) and
done (green dot, frozen elapsed). Fixed right sidebar at `lg:` breakpoints — doesn't affect
the `max-w-2xl` content column layout.

#### Result
- `app/frontend/src/hooks/useAgentStream.ts` — `FlowEntry` type + `flowLog: FlowEntry[]` state field.
  `node_start` case freezes previous active entry's `endedAt` and appends a new active entry.
  `done` case freezes any remaining active entry.
- `app/frontend/src/components/FlowPanel.tsx` — new component (~75 lines). Fixed right sidebar,
  `hidden lg:flex`, `w-[272px]`. Label computed at render time so "Step N/3" updates when plan arrives.
  `useEffect` interval ticks only while active entries exist.
- `app/frontend/src/App.tsx` — wrapped in `<>...</>` fragment, `<FlowPanel>` rendered after `<AgentLayout>`.

---

### 3.9 — FlowPanel per-node expanded detail

#### Plan
Move all agent working state (plan steps, executor progress, synthesiser status) out of the
main content area and into the FlowPanel sidebar. Each node row expands inline to show its
own input/output — classifier shows the chosen route, planner shows live plan steps with
status badges, executor shows the step it is handling, synthesiser shows generation state.
Main content column then shows only: task input + final AnswerCard.

#### Result
- `app/backend/server.py` — added `classifier_result {intent: "planning"|"chatting"}` SSE event
  emitted when the classifier chunk arrives, so the frontend knows which route was chosen.
- `app/frontend/src/hooks/useAgentStream.ts` — added `"classifier"` and `"chat"` to `FlowNodeName`;
  added `classifierIntent` field to `AgentStreamState`; handles new `classifier_result` event.
- `app/frontend/src/components/FlowPanel.tsx` — full rewrite (~195 lines). Each flow entry now
  renders node-specific detail below the header row: `ClassifierDetail`, `PlannerDetail` (live
  step badges), `ExecutorDetail` (step text for this entry), `SynthesiserDetail`. Active rows
  get a subtle blue background.
- `app/frontend/src/App.tsx` — removed `PlanView` and `ExecutorProgress` imports and usage from
  the main content; updated `<FlowPanel>` to pass `answer` and `classifierIntent` props.

## Phase 4 — Docker

- Dockerfiles per service
- `docker-compose.yml` for full self-hosted stack

---

### 3.10 — Generative UI component registry

#### Plan
Replace the hardcoded `{type: "answer", content: markdown}` → `AnswerCard` pipeline with a
named-component dispatch system. Graph nodes call `get_stream_writer()` (official LangGraph API,
`stream_mode="custom"`, `version="v2"`) to emit `{name, props}` events. Server forwards them as
`component` SSE frames. Frontend dispatches by name through a registry. First real custom
component: `WeatherCard` (structured props extracted via `with_structured_output`).

Key decisions:
- `get_stream_writer()` from `langgraph.config` — official LangGraph pattern, decouples UI payload
  from node return value, allows future mid-node streaming updates.
- `stream_mode=["updates", "custom"]` + `version="v2"` in `graph.stream()` — needed to receive
  custom events; v2 gives unified `{type, ns, data}` chunk format.
- Keyword heuristic for weather detection (no second LLM call) — cheap, fast, good enough.
- `ui_events` state field kept as fallback for tests (writer no-ops outside streaming context).

#### Result
- `app/backend/server.py` — switched to `stream_mode=["updates", "custom"]` + `version="v2"`.
  Renamed `_events_from_chunk` → `_events_from_updates`, handles `chunk["type"] == "updates"`.
  New branch: `chunk["type"] == "custom"` → `event: component` SSE frame forwarded verbatim.
- `app/backend/nodes/synthesiser.py` — imports `get_stream_writer`. Detects weather queries via
  keyword set. Weather path: `with_structured_output(WeatherProps)` extracts structured fields,
  emits `writer({"name": "WeatherCard", "props": ...})`. Prose path: emits `writer({"name":
  "AnswerCard", "props": {"content": ...}})`. Both paths also write `ui_events` as fallback.
- `app/backend/nodes/chat.py` — imports `get_stream_writer`, emits `AnswerCard` via writer.
- `app/frontend/src/hooks/useAgentStream.ts` — added `UIComponent` type and `components:
  UIComponent[]` to `AgentStreamState`. New `component` event case appends to `components[]`.
  Legacy `answer` event wrapped as `AnswerCard` component for unified render path.
- `app/frontend/src/components/registry.tsx` — new file. `REGISTRY` map: name string → React
  component. `ComponentRenderer` dispatches by name with AnswerCard fallback for unknown names.
- `app/frontend/src/components/WeatherCard.tsx` — new file. Props: city, condition, temp_c,
  feels_like_c, humidity, wind_speed_kmh, wind_direction, aqi, aqi_label, visibility_km, summary.
  Large temperature display, secondary stats grid, summary prose. Both °C and °F shown.
- `app/frontend/src/App.tsx` — replaced `<AnswerCard content={state.answer} />` with
  `state.components.map((c, i) => <ComponentRenderer key={i} name={c.name} props={c.props} />)`.
