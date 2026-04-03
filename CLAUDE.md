# CLAUDE.md

## Project
LangGraph + LiveKit + Qwen3.5 voice/chat agent (FRIDAY).

**Stack:**
- LangGraph — agent graph / ReAct loop
- LiveKit — real-time voice/audio transport
- Qwen3.5 — local LLM via llama.cpp OpenAI-compatible endpoint (`http://127.0.0.1:8081/v1`)
- Tavily — optional web search tool

## Development Philosophy
**Small, reviewable changes only.** Each iteration should be:
- One clear idea — a single function, a single fix, a single new tool
- Short enough to read and understand in one pass
- Committed before moving to the next thing
- for everychange we wanna test it and see how the flow is working, intermediary input output to really understand new code!
- Keep a architectural high level design diagram and update as repo evolves to reflect latest changes.
- To test new code, best in jupyter notebook where we can see input output and new code being tested to fully understand. create new notebook per new code (but if its continuation of previous code can be same notebook, if new class, new fucntionality => new notebook)
- Explaining what that code is doing and how its doing is big plus!
- Update code documentations if the code is changed!
- Always use latest official documents for libraries specially LangGraph and Livekit.io via their MCP server (u have access)
- Never use emoji in this repo!

If a proposed change is more than ~50 lines of new/changed code, stop and split it.

## Code Style
- Minimal — no boilerplate, no speculative abstractions
- Proper docstrings everywhere and line comments where logic is harder
- Proper error handling
- Prefer flat over nested; prefer explicit over clever
- **Always document the WHY behind design decisions** — why this type, why this structure, why not the obvious alternative. Put it as a comment right next to the decision, not in a separate doc.

## Workflow
1. Read and understand the relevant code before touching it
2. Propose the smallest possible change towards the big grand plan/ endgoal.
3. Implement, then review together before committing
4. Commit each working increment — don't batch up multiple ideas

## ROADMAP.md usage
`ROADMAP.md` is the living project log — update it at every step:

- **Before implementing:** add a `### Plan` subsection under the current step — what you intend to do, key decisions, edge cases.
- **After implementing:** add a `### Result` subsection — what was built, what file(s) changed, anything surprising or worth noting.

The top-level phase table in `ROADMAP.md` stays as the high-level overview. The per-step plan + result entries accumulate below it as a running log.

## Grand Plan
Full roadmap lives in the plan file. Work through phases in order, one increment at a time.

| Phase | Goal |
|-------|------|
| 1 | LangGraph StateGraph — supervisor, planner, executor, coder nodes |
| 2 | LiveKit voice pipeline — faster-whisper STT + Kokoro/Piper TTS |
| 3 | Generative UI — SSE state streaming + React frontend (LiveKit Agents UI aesthetic) |
| 4 | Docker — docker-compose for full self-hosted stack |

Current phase: **1 — LangGraph StateGraph**
Current step: **1.7 done — ReAct intent router** (`nodes/classifier.py`, `nodes/chat.py`)

Full step-by-step roadmap: [`ROADMAP.md`](ROADMAP.md)

## Project Conventions
- `.env` for secrets (`TAVILY_API_KEY`, etc.) — never commit
- LLM client: `ChatOpenAI` pointed at local llama.cpp, `api_key="no-key"`
- Agent entry point: `agent.py`
- Tools are opt-in — only added when env vars are present
