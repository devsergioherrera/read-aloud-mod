"""Reads text from stdin and speaks it with Kokoro, streaming sentence by sentence."""

import asyncio
import os
import re
import shutil
import signal
import subprocess
import sys
from pathlib import Path

import numpy as np
from kokoro_onnx import Kokoro

DATA = Path(os.environ.get("READ_ALOUD_HOME") or Path(os.environ.get("XDG_CACHE_HOME") or Path.home() / ".cache") / "read-aloud")

RATE = 24000
CUE = re.compile("(.*?)", re.S)

player = None


def player_argv():
    if shutil.which("paplay"):
        return ["paplay", "--raw", f"--rate={RATE}", "--format=float32le", "--channels=1"]
    if shutil.which("aplay"):
        return ["aplay", "-q", "-t", "raw", "-f", "FLOAT_LE", "-r", str(RATE), "-c", "1"]
    if shutil.which("ffplay"):
        return ["ffplay", "-nodisp", "-autoexit", "-loglevel", "quiet", "-f", "f32le", "-ar", str(RATE), "-ac", "1", "-i", "-"]
    sys.exit("no audio player found (paplay, aplay or ffplay)")


def stop(*_):
    if player and player.poll() is None:
        player.kill()
    os._exit(0)


def play(samples):
    global player
    if player is None:
        player = subprocess.Popen(player_argv(), stdin=subprocess.PIPE)
    player.stdin.write(samples.astype("<f4").tobytes())
    player.stdin.flush()


def silence(seconds):
    play(np.zeros(int(RATE * seconds), dtype=np.float32))


async def say(kokoro, text, voice, speed, lang):
    # One sentence at a time: kokoro batches long text, which delays the first audio.
    for sentence in re.split(r"(?<=[.!?])\s+", text.strip()):
        if not sentence:
            continue
        async for samples, rate in kokoro.create_stream(sentence, voice=voice, speed=speed, lang=lang):
            play(samples)
            silence(0.12)


async def main():
    text = sys.stdin.read().strip()
    if not text:
        return

    kokoro = Kokoro(str(DATA / "kokoro.onnx"), str(DATA / "voices.bin"))
    voice = os.environ.get("SPEAK_VOICE", "am_michael")
    speed = float(os.environ.get("SPEAK_SPEED", "1.3"))
    lang = os.environ.get("SPEAK_LANG", "en-us")

    # Odd parts are cues ("look at the code on screen"): soft pause, slower, soft pause.
    for index, part in enumerate(CUE.split(text)):
        if index % 2 == 1:
            silence(0.5)
            await say(kokoro, part, voice, speed * 0.88, lang)
            silence(0.8)
        else:
            await say(kokoro, part, voice, speed, lang)

    if player:
        player.stdin.close()
        player.wait()


signal.signal(signal.SIGTERM, stop)
signal.signal(signal.SIGINT, stop)
asyncio.run(main())
