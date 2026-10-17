#!/usr/bin/env bash
# Smoke test of the speech-to-text MCP server (mcp/whisper): starts it over stdio as Orkeon
# does, transcribes mcp/whisper/samples/fr-5s.wav with the `tiny` model and expects the word
# "dérive". Needs uv (https://docs.astral.sh/uv/) and, the first time, the network: uv resolves
# mcp/whisper/pyproject.toml into mcp/whisper/.venv and faster-whisper downloads the model (75 MB).
#
#   bash scripts/whisper-mcp-smoke.sh
#   WHISPER_MODEL=small bash scripts/whisper-mcp-smoke.sh   # another model (also pre-downloads it)
#   bash scripts/whisper-mcp-smoke.sh --tts                 # speech output too: Piper (the tts extra) then Whisper back
#   WHISPER_DEVICE=cuda WHISPER_COMPUTE_TYPE=float16 bash scripts/whisper-mcp-smoke.sh   # on an NVIDIA GPU (the cuda extra)
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

command -v uv >/dev/null 2>&1 || {
  echo "whisper-mcp-smoke: uv not found. Install it: curl -LsSf https://astral.sh/uv/install.sh | sh" >&2
  exit 2
}
extras=()
for arg in "$@"; do [ "$arg" = --tts ] && extras=(--extra tts); done
if [ "$(printf '%s' "${WHISPER_DEVICE:-}" | tr -d '[:space:]' | tr '[:upper:]' '[:lower:]')" = cuda ]; then extras+=(--extra cuda); fi
exec uv run --project mcp/whisper ${extras[@]+"${extras[@]}"} python mcp/whisper/smoke.py "$@"
