#!/usr/bin/env bash
# Speaks stdin with Kokoro when /speak setup has run, else with speech-dispatcher.
# `speak.sh --check` prints which of the two it would use.
set -u

DATA="${READ_ALOUD_HOME:-${XDG_CACHE_HOME:-$HOME/.cache}/read-aloud}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PY="$DATA/venv/bin/python"

is_ready() { [ -x "$PY" ] && [ -f "$DATA/kokoro.onnx" ] && [ -f "$DATA/voices.bin" ]; }

if [ "${1:-}" = "--check" ]; then
  if is_ready; then echo "Kokoro voice ready ($DATA)"; else echo "Kokoro not installed, using the robotic fallback. Run /speak setup."; fi
  exit 0
fi

if is_ready; then
  exec "$PY" "$HERE/speak.py"
fi

command -v spd-say >/dev/null || { echo "no speech engine: run /speak setup" >&2; exit 1; }
text="$(cat)"
trap 'spd-say -S; exit 0' TERM INT
spd-say -w -- "$text" &
wait $!
