"""Reads text from stdin and speaks it with Kokoro, streaming sentence by sentence."""

import asyncio
import io
import os
import queue
import re
import shutil
import signal
import subprocess
import sys
import threading
import wave
from pathlib import Path

import numpy as np

IS_WINDOWS = sys.platform == "win32"


def data_dir():
    if os.environ.get("READ_ALOUD_HOME"):
        return Path(os.environ["READ_ALOUD_HOME"])
    if IS_WINDOWS:
        return Path(os.environ.get("LOCALAPPDATA") or Path.home() / "AppData" / "Local") / "read-aloud"
    return Path(os.environ.get("XDG_CACHE_HOME") or Path.home() / ".cache") / "read-aloud"


DATA = data_dir()

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


def wav_bytes(samples):
    """Mono 16-bit WAV in memory, the format Windows can play without any extra package."""
    pcm = (np.clip(samples, -1.0, 1.0) * 32767).astype("<i2")
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(RATE)
        wav.writeframes(pcm.tobytes())
    return buffer.getvalue()


win_queue = queue.Queue()
win_worker = None


def win_play_loop():
    import winsound

    while True:
        data = win_queue.get()
        if data is None:
            return
        winsound.PlaySound(data, winsound.SND_MEMORY)


def play(samples):
    global player, win_worker
    if IS_WINDOWS:
        if win_worker is None:
            win_worker = threading.Thread(target=win_play_loop, daemon=True)
            win_worker.start()
        win_queue.put(wav_bytes(samples))
        return
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

    if IS_WINDOWS and win_worker:
        win_queue.put(None)
        win_worker.join()
    elif player:
        player.stdin.close()
        player.wait()


if __name__ == "__main__":
    from kokoro_onnx import Kokoro

    sys.stdin.reconfigure(encoding="utf-8")
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    asyncio.run(main())
