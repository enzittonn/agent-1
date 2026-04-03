"""Central config for the FRIDAY agent.

All LLM connection details live in .env — this module reads them once and
exposes typed constants. Import from here instead of hardcoding strings in
individual nodes or scripts.
"""

import os
from pathlib import Path

from dotenv import load_dotenv

# Walk up two levels (app/backend → app → project root) to find the root .env.
# Originally pointed at app/backend/.env — changed because the actual .env
# lives at project root alongside CLAUDE.md / ROADMAP.md.
load_dotenv(Path(__file__).parents[2] / ".env")

# LLM server — defaults mirror server.sh defaults so the system works
# out-of-the-box even without .env entries.
LLM_PORT: int = int(os.getenv("LLM_PORT", "8081"))
LLM_MODEL: str = os.getenv("LLM_MODEL", "qwen3")
LLM_API_KEY: str = os.getenv("LLM_API_KEY", "no-key")

# Derived — single place to change if the transport or host ever differs.
LLM_BASE_URL: str = f"http://127.0.0.1:{LLM_PORT}/v1"

# Backend HTTP server port.
BACKEND_PORT: int = int(os.getenv("BACKEND_PORT", "8000"))

# Allowed CORS origins — comma-separated in .env so new Vite ports can be
# added without touching Python code.
FRONTEND_ORIGINS: list[str] = [
    o.strip()
    for o in os.getenv("FRONTEND_ORIGINS", "http://localhost:5173").split(",")
    if o.strip()
]
