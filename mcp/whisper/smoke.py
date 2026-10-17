"""Smoke test of the Whisper MCP server: the real transport, the real model.

Starts whisper_mcp.py over stdio the way Orkeon does, with samples/ as /audio and a temporary
folder as /transcripts, lists the tools, asks whisper_info, transcribes samples/fr-5s.wav with the
`tiny` model (WHISPER_MODEL overrides it) and expects the word "dérive" (WHISPER_SMOKE_WORD) in the
text. The first run downloads the model (75 MB for tiny).

With --tts (the `tts` extra), speech output too: speak writes a French sentence with Piper (the
speaker stays off), and the same server transcribes that speech.wav back, expecting "bonjour" (the
word the tiny model always hears; it hears "synthèse vocale" with small).

  uv run --project mcp/whisper python mcp/whisper/smoke.py      # or scripts/whisper-mcp-smoke.sh [--tts]
"""

from __future__ import annotations

import asyncio
import os
import shutil
import sys
import tempfile
import time
import unicodedata
from pathlib import Path

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

HERE = Path(__file__).resolve().parent


def fold(text: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", text.lower()) if not unicodedata.combining(c))


async def main() -> int:
    word = os.environ.get("WHISPER_SMOKE_WORD", "dérive")
    tts = "--tts" in sys.argv[1:]
    with tempfile.TemporaryDirectory(prefix="whisper-smoke-") as out:
        audio = HERE / "samples"
        if tts:  # one folder for both, so the speech written can be transcribed back
            shutil.copy(audio / "fr-5s.wav", out)
            audio = Path(out)
        env = {
            **os.environ,
            "WHISPER_AUDIO_DIR": str(audio),
            "WHISPER_OUT_DIR": out,
            "WHISPER_MODEL": os.environ.get("WHISPER_MODEL", "tiny"),
        }
        params = StdioServerParameters(command=sys.executable, args=[str(HERE / "whisper_mcp.py")], env=env)
        started = time.monotonic()
        async with stdio_client(params) as (read, write), ClientSession(read, write) as session:
            await session.initialize()
            tools = sorted(t.name for t in (await session.list_tools()).tools)
            print(f"handshake + list_tools: {time.monotonic() - started:.1f} s, tools: {', '.join(tools)}")
            if tools != ["list_audio", "record_and_transcribe", "speak", "stop_speaking", "transcribe_audio", "whisper_info"]:
                print("unexpected tool list", file=sys.stderr)
                return 1
            info = (await session.call_tool("whisper_info", {})).content[0].text
            print(info)
            started = time.monotonic()
            result = await session.call_tool("transcribe_audio", {"path": "/audio/fr-5s.wav", "language": "fr"})
            text = result.content[0].text
            print(f"transcribe_audio: {time.monotonic() - started:.1f} s (model download included on the first run)")
            print(text)
            if result.isError:
                return 1
            if fold(word) not in fold(text):
                print(f"expected the word {word!r} in the transcription", file=sys.stderr)
                return 1
            if not Path(out, "fr-5s.txt").is_file():
                print("the transcript file was not written", file=sys.stderr)
                return 1
            if tts:
                started = time.monotonic()
                said = await session.call_tool("speak", {"text": "Bonjour, ceci est un **essai** de synthèse vocale."})
                print(f"speak: {time.monotonic() - started:.1f} s (voice download included on the first run)")
                print(said.content[0].text)
                if said.isError:
                    return 1
                heard = await session.call_tool("transcribe_audio", {"path": "/audio/speech.wav", "language": "fr"})
                print("heard back:", heard.content[0].text.split("\n")[0])
                if heard.isError or "bonjour" not in fold(heard.content[0].text):
                    print("expected 'bonjour' in the transcription of speech.wav", file=sys.stderr)
                    return 1
    print("whisper-mcp smoke: ok")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
