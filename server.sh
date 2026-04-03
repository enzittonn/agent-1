#!/usr/bin/env bash
set -euo pipefail

# Fix for llama.cpp hanging on Hugging Face preset fetch.
# This script downloads the GGUF locally, then starts llama-server with -m.

# Load .env so PORT (and other LLM vars) stay in sync with what Python code reads.
# set -a exports every variable defined while active; set +a restores normal behaviour.
SCRIPT_DIR_EARLY="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "${SCRIPT_DIR_EARLY}/.env" ]]; then
  set -a
  # shellcheck source=.env
  source "${SCRIPT_DIR_EARLY}/.env"
  set +a
fi


# REPO="Jackrong/Qwen3.5-4B-Claude-4.6-Opus-Reasoning-Distilled-v2-GGUF"
# FILE="Qwen3.5-4B.Q8_0-Opus46-v2.gguf"
# REPO="HauhauCS/Qwen3.5-4B-Uncensored-HauhauCS-Aggressive"
# FILE="Qwen3.5-4B-Uncensored-HauhauCS-Aggressive-Q6_K.gguf"

REPO="unsloth/Qwen3.5-4B-GGUF"
# THESE ARE DOWNLOADED MODELS
# FILE="Qwen3.5-0.8B-Q5_K_M.gguf"             # 186 t/s CUDA
# FILE="Qwen3.5-2B-UD-Q4_K_XL.gguf"           # 133 t/s CUDA
FILE="Qwen3.5-4B-Q5_K_M.gguf"               # 67 t/s CUDA
MM_PROJ_FILE="mmproj-F16.gguf"            # enable vision for multimodal for Qwen3.5-4B-Q5_K_M.gguf
# FILE="Qwen3.5-9B-Q4_K_M.gguf"               # 49 t/s CUDA


MODEL_DIR="${MODEL_DIR:-/home/kisuke/Developments/ML/Models/Qwen/models}"
MODEL_PATH="${MODEL_DIR}/${FILE}"
MM_PROJ_REPO="${MM_PROJ_REPO:-$REPO}"
MM_PROJ_FILE="${MM_PROJ_FILE:-}"
MM_PROJ_PATH="${MODEL_DIR}/${MM_PROJ_FILE}"
PORT="${LLM_PORT:-8081}"
CTX_SIZE="${CTX_SIZE:-16384}"
REASONING="${REASONING:-off}"
REASONING_BUDGET="${REASONING_BUDGET:-0}"
DEFAULT_CHAT_TEMPLATE_KWARGS='{"enable_thinking": false}'
CHAT_TEMPLATE_KWARGS="${CHAT_TEMPLATE_KWARGS:-$DEFAULT_CHAT_TEMPLATE_KWARGS}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

PYTHON_BIN=""
if command -v python3 >/dev/null 2>&1; then
  PYTHON_BIN="$(command -v python3)"
elif command -v python >/dev/null 2>&1; then
  PYTHON_BIN="$(command -v python)"
fi

mkdir -p "${MODEL_DIR}"

LLAMA_SERVER_BIN="${LLAMA_SERVER_BIN:-}"

if [[ -z "${LLAMA_SERVER_BIN}" ]]; then
  if command -v llama-server >/dev/null 2>&1; then
    LLAMA_SERVER_BIN="$(command -v llama-server)"
  else
    for candidate in \
      "${HOME}/llama.cpp/llama-server" \
      "${HOME}/llama.cpp/build/bin/llama-server"
    do
      if [[ -x "${candidate}" ]]; then
        LLAMA_SERVER_BIN="${candidate}"
        break
      fi
    done
  fi
fi

if [[ -z "${LLAMA_SERVER_BIN}" ]]; then
  echo "Error: llama-server not found in PATH or common local llama.cpp locations"
  echo "Set LLAMA_SERVER_BIN=/full/path/to/llama-server if needed."
  exit 1
fi

if [[ ! -f "${MODEL_PATH}" ]]; then
  echo "Model not found locally. Downloading ${REPO}/${FILE} ..."

  # Helps with some Hugging Face download hangs.
  export HF_HUB_DISABLE_XET=1
  export HF_HUB_ENABLE_HF_TRANSFER=0

  if command -v huggingface-cli >/dev/null 2>&1; then
    huggingface-cli download "${REPO}" "${FILE}" \
      --local-dir "${MODEL_DIR}" \
      --local-dir-use-symlinks False
  elif command -v curl >/dev/null 2>&1; then
    curl -fL --progress-bar \
      "https://huggingface.co/${REPO}/resolve/main/${FILE}?download=true" \
      -o "${MODEL_PATH}"
  elif command -v wget >/dev/null 2>&1; then
    wget -O "${MODEL_PATH}" \
      "https://huggingface.co/${REPO}/resolve/main/${FILE}?download=true"
  elif [[ -n "${PYTHON_BIN}" ]]; then
    HF_VENV_DIR="${SCRIPT_DIR}/.hf-download-venv"

    if [[ ! -x "${HF_VENV_DIR}/bin/python" ]]; then
      "${PYTHON_BIN}" -m venv "${HF_VENV_DIR}"
    fi

    "${HF_VENV_DIR}/bin/python" -m pip install -U pip "huggingface_hub"
    "${HF_VENV_DIR}/bin/python" - <<PY
from huggingface_hub import hf_hub_download

path = hf_hub_download(
    repo_id="${REPO}",
    filename="${FILE}",
    local_dir="${MODEL_DIR}",
    local_dir_use_symlinks=False,
)
print(f"Downloaded to: {path}")
PY
  else
    echo "Error: neither huggingface-cli nor python is available"
    exit 1
  fi
fi

if [[ -n "${MM_PROJ_FILE}" && ! -f "${MM_PROJ_PATH}" ]]; then
  echo "mmproj not found locally. Downloading ${MM_PROJ_REPO}/${MM_PROJ_FILE} ..."

  if command -v huggingface-cli >/dev/null 2>&1; then
    huggingface-cli download "${MM_PROJ_REPO}" "${MM_PROJ_FILE}" \
      --local-dir "${MODEL_DIR}" \
      --local-dir-use-symlinks False
  elif command -v curl >/dev/null 2>&1; then
    curl -fL --progress-bar \
      "https://huggingface.co/${MM_PROJ_REPO}/resolve/main/${MM_PROJ_FILE}?download=true" \
      -o "${MM_PROJ_PATH}"
  elif command -v wget >/dev/null 2>&1; then
    wget -O "${MM_PROJ_PATH}" \
      "https://huggingface.co/${MM_PROJ_REPO}/resolve/main/${MM_PROJ_FILE}?download=true"
  elif [[ -n "${PYTHON_BIN}" ]]; then
    HF_VENV_DIR="${SCRIPT_DIR}/.hf-download-venv"

    if [[ ! -x "${HF_VENV_DIR}/bin/python" ]]; then
      "${PYTHON_BIN}" -m venv "${HF_VENV_DIR}"
    fi

    "${HF_VENV_DIR}/bin/python" -m pip install -U pip "huggingface_hub"
    "${HF_VENV_DIR}/bin/python" - <<PY
from huggingface_hub import hf_hub_download

path = hf_hub_download(
    repo_id="${MM_PROJ_REPO}",
    filename="${MM_PROJ_FILE}",
    local_dir="${MODEL_DIR}",
    local_dir_use_symlinks=False,
)
print(f"Downloaded to: {path}")
PY
  else
    echo "Error: cannot download mmproj because neither huggingface-cli nor python is available"
    exit 1
  fi
fi

echo "Using llama-server binary: ${LLAMA_SERVER_BIN}"
echo "Starting llama-server with local GGUF: ${MODEL_PATH}"
if [[ -n "${MM_PROJ_FILE}" ]]; then
  echo "Using multimodal projector: ${MM_PROJ_PATH}"
else
  echo "Vision disabled: set MM_PROJ_FILE to enable multimodal input"
fi
echo "Reasoning mode: ${REASONING}"
echo "Reasoning budget: ${REASONING_BUDGET}"
echo "If this works, the original issue was the -hf preset/download path, not Metal."

LLAMA_ARGS=(
  -m "${MODEL_PATH}"
  --ctx-size "${CTX_SIZE}"
  --parallel 1
  --n-gpu-layers 999
  --temp 1.0
  --top-p 0.95
  --top-k 20
  --min-p 0.00
  --chat-template-kwargs "${CHAT_TEMPLATE_KWARGS}"
  --reasoning "${REASONING}"
  # --reasoning-budget "${REASONING_BUDGET}"
  --port "${PORT}"
)

if [[ -n "${MM_PROJ_FILE}" ]]; then
  LLAMA_ARGS+=(--mmproj "${MM_PROJ_PATH}")
fi

exec "${LLAMA_SERVER_BIN}" "${LLAMA_ARGS[@]}"