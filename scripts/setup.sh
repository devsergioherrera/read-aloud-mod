#!/usr/bin/env bash
# One-time install of the Kokoro voice: a private venv plus the int8 model (~120 MB).
set -euo pipefail

DATA="${READ_ALOUD_HOME:-${XDG_CACHE_HOME:-$HOME/.cache}/read-aloud}"
MODELS=https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0

command -v uv >/dev/null || { echo "uv is required (https://docs.astral.sh/uv/getting-started/installation/)"; exit 1; }
command -v paplay >/dev/null || command -v aplay >/dev/null || command -v ffplay >/dev/null || { echo "install an audio player: paplay, aplay or ffplay"; exit 1; }

mkdir -p "$DATA"

if [ ! -x "$DATA/venv/bin/python" ]; then
  uv venv --python 3.13 "$DATA/venv"
fi
uv pip install --python "$DATA/venv/bin/python" "kokoro-onnx==0.6.1"

fetch() {
  if [ ! -f "$DATA/$2" ]; then
    curl -fsSL --retry 3 -o "$DATA/$2.part" "$MODELS/$1"
    mv "$DATA/$2.part" "$DATA/$2"
  fi
}
fetch kokoro-v1.0.int8.onnx kokoro.onnx
fetch voices-v1.0.bin voices.bin

echo "Kokoro voice installed in $DATA"
