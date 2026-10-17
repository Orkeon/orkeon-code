"""Unit tests of the Whisper MCP server, without a model and without the network.

A FakeTranscriber stands in for faster-whisper; the MCP contract test drives the real server
through the SDK's in-memory client session.
"""

from __future__ import annotations

import asyncio
import json
import sys
import types
from pathlib import Path

import pytest
from mcp.server.fastmcp.exceptions import ToolError
from mcp.shared.memory import create_connected_server_and_client_session

import whisper_mcp as w


class FakeTranscriber:
    def __init__(self, segments: tuple[w.Segment, ...] | None = None, language: str = "fr") -> None:
        self.segments = segments or (w.Segment(0.0, 2.5, " Bonjour à tous."), w.Segment(2.5, 5.0, " On commence."))
        self.language = language
        self.calls: list[tuple[Path, str, str, bool]] = []

    def transcribe(self, source: Path, language: str, vocabulary: str, vad_filter: bool) -> w.Transcript:
        self.calls.append((source, language, vocabulary, vad_filter))
        return w.Transcript(language or self.language, 0.98, 5.0, self.segments)

    def describe(self) -> dict[str, object]:
        return {"backend": "fake", "model": "none"}


@pytest.fixture
def settings(tmp_path: Path) -> w.Settings:
    audio, out = tmp_path / "audio", tmp_path / "transcripts"
    audio.mkdir()
    (audio / "daily.m4a").write_bytes(b"\0" * 16)
    (audio / "team").mkdir()
    (audio / "team" / "review.mp4").write_bytes(b"\0" * 16)
    (audio / "notes.txt").write_text("not audio")
    (tmp_path / "secret.wav").write_bytes(b"\0" * 16)
    return w.Settings(audio_dir=audio, out_dir=out)


# ── Settings ────────────────────────────────────────────────────────────────


def test_settings_require_the_two_folders() -> None:
    with pytest.raises(SystemExit, match="WHISPER_AUDIO_DIR and WHISPER_OUT_DIR"):
        w.Settings.from_env({})
    with pytest.raises(SystemExit, match="WHISPER_OUT_DIR"):
        w.Settings.from_env({"WHISPER_AUDIO_DIR": "/a"})


def test_settings_defaults_and_backends() -> None:
    base = {"WHISPER_AUDIO_DIR": "/a", "WHISPER_OUT_DIR": "/t"}
    local = w.Settings.from_env(base)
    assert (local.backend, local.model, local.device, local.compute_type) == ("local", "small", "cpu", "int8")
    assert w.Settings.from_env({**base, "WHISPER_DEVICE": " CUDA "}).device == "cuda", "read as the launcher writes it"
    cloud = w.Settings.from_env({**base, "WHISPER_BACKEND": "openai"})
    assert (cloud.model, cloud.api_key_var) == ("whisper-1", "OPENAI_API_KEY")
    http = w.Settings.from_env({**base, "WHISPER_BACKEND": "http", "WHISPER_BASE_URL": "http://host:8000/v1", "WHISPER_MODEL": "x"})
    assert (http.backend, http.base_url, http.model, http.api_key_var) == ("http", "http://host:8000/v1", "x", "")
    named = w.Settings.from_env({**base, "WHISPER_BACKEND": "http", "WHISPER_BASE_URL": "http://h/v1", "WHISPER_API_KEY_VAR": "SPEACHES_KEY"})
    assert named.api_key_var == "SPEACHES_KEY"
    with pytest.raises(SystemExit, match="WHISPER_BASE_URL"):
        w.Settings.from_env({**base, "WHISPER_BACKEND": "http"})
    with pytest.raises(SystemExit, match="expected local, openai, http"):
        w.Settings.from_env({**base, "WHISPER_BACKEND": "cloud"})


# ── Paths ───────────────────────────────────────────────────────────────────


def test_resolve_accepts_virtual_paths_and_bare_names(settings: w.Settings) -> None:
    assert w.resolve_audio(settings, "/audio/daily.m4a") == (settings.audio_dir / "daily.m4a").resolve()
    assert w.resolve_audio(settings, "daily.m4a") == (settings.audio_dir / "daily.m4a").resolve()
    assert w.resolve_audio(settings, " /audio/team/review.mp4 ").name == "review.mp4"


@pytest.mark.parametrize(
    ("path", "message"),
    [
        ("", "names a file under /audio"),
        ("/audio", "names a file under /audio"),
        ("/workspace/daily.m4a", "outside /audio"),
        ("/audio/../secret.wav", "leaves /audio"),
        ("../secret.wav", "leaves /audio"),
        ("/audio/missing.m4a", "no file at /audio/missing.m4a"),
        ("/audio/notes.txt", "not an audio or video file"),
    ],
)
def test_resolve_refuses(settings: w.Settings, path: str, message: str) -> None:
    with pytest.raises(ToolError, match=message):
        w.resolve_audio(settings, path)


# ── Results ─────────────────────────────────────────────────────────────────


def test_short_transcript_is_inline_and_written(settings: w.Settings) -> None:
    fake = FakeTranscriber()
    server = w.build_server(settings, fake)
    result = call(server, "transcribe_audio", {"path": "/audio/daily.m4a", "language": "fr", "vocabulary": "Orkeon"})
    assert result.startswith("Bonjour à tous. On commence.\n\n[language fr (0.98), 5 s, 5 words; written to /transcripts/daily.txt")
    assert "segments: /transcripts/daily.segments.json]" in result
    assert fake.calls == [((settings.audio_dir / "daily.m4a").resolve(), "fr", "Orkeon", True)]
    assert (settings.out_dir / "daily.txt").read_text(encoding="utf-8") == "Bonjour à tous. On commence.\n"
    segments = json.loads((settings.out_dir / "daily.segments.json").read_text(encoding="utf-8"))
    assert segments["source"] == "/audio/daily.m4a"
    assert segments["segments"] == [
        {"start": 0.0, "end": 2.5, "text": "Bonjour à tous."},
        {"start": 2.5, "end": 5.0, "text": "On commence."},
    ]


def test_subfolders_are_kept_under_transcripts(settings: w.Settings) -> None:
    result = call(w.build_server(settings, FakeTranscriber()), "transcribe_audio", {"path": "team/review.mp4", "vad_filter": False})
    assert "written to /transcripts/team/review.txt" in result
    assert (settings.out_dir / "team" / "review.txt").is_file()


def test_long_transcript_goes_to_files_in_parts(settings: w.Settings) -> None:
    segments = tuple(w.Segment(i * 3.0, i * 3.0 + 3.0, f" Segment numéro {i:04d} de la réunion.") for i in range(2_000))
    fake = FakeTranscriber(segments)
    result = call(w.build_server(settings, fake), "transcribe_audio", {"path": "/audio/daily.m4a"})
    text = w.Transcript("fr", 1, 1, segments).text
    assert len(text) > w.PART_LIMIT
    assert len(result) < 4_000
    assert result.startswith(f"[language fr (0.98), 5 s, {len(text.split())} words; {len(text)} characters, too long to return here: ")
    assert "read it part by part with file_read: /transcripts/daily.part-01.txt, /transcripts/daily.part-02.txt" in result
    assert result.endswith("…") and "It begins: Segment numéro 0000" in result
    parts = sorted(settings.out_dir.glob("daily.part-*.txt"))
    assert [p.name for p in parts] == ["daily.part-01.txt", "daily.part-02.txt", "daily.part-03.txt"][: len(parts)]
    assert all(len(p.read_text(encoding="utf-8")) <= w.PART_LIMIT + 1 for p in parts)
    assert " ".join(p.read_text(encoding="utf-8").rstrip("\n") for p in parts) == text
    assert (settings.out_dir / "daily.txt").read_text(encoding="utf-8") == text + "\n"


def test_medium_transcript_names_the_file_without_parts(settings: w.Settings) -> None:
    segments = tuple(w.Segment(i, i + 1, " mot " * 20) for i in range(60))  # ~6 000 characters
    result = call(w.build_server(settings, FakeTranscriber(segments)), "transcribe_audio", {"path": "daily.m4a"})
    assert "too long to return here: read /transcripts/daily.txt with file_read;" in result
    assert not list(settings.out_dir.glob("*.part-*"))


def test_split_parts_cuts_a_segment_longer_than_a_part_at_a_space() -> None:
    assert w.split_parts((w.Segment(0, 9, "aaa bbb ccc dd"),), limit=7) == ["aaa bbb", "ccc dd"]
    assert w.split_parts((w.Segment(0, 9, "abcdefghij"),), limit=4) == ["abcd", "efgh", "ij"]


def test_a_shorter_transcription_removes_the_parts_of_a_longer_one(settings: w.Settings) -> None:
    settings.out_dir.mkdir(parents=True)
    for number in (1, 2, 3):
        (settings.out_dir / f"daily.part-0{number}.txt").write_text("old", encoding="utf-8")
    (settings.out_dir / "daily-notes.part-01.txt").write_text("another file", encoding="utf-8")
    (settings.out_dir / "daily.part-x.txt").write_text("not a part", encoding="utf-8")
    (settings.audio_dir / "daily.part-02.m4a").write_bytes(b"\0" * 16)  # a media file named like a part: its transcript stays
    call(w.build_server(settings, FakeTranscriber()), "transcribe_audio", {"path": "daily.m4a"})
    assert sorted(p.name for p in settings.out_dir.glob("*.part-*")) == ["daily-notes.part-01.txt", "daily.part-02.txt", "daily.part-x.txt"]


def test_split_parts_cuts_between_segments() -> None:
    segments = (w.Segment(0, 1, "aaaa"), w.Segment(1, 2, "bbbb"), w.Segment(2, 3, " "), w.Segment(3, 4, "cc"))
    assert w.split_parts(segments, limit=9) == ["aaaa bbbb", "cc"]
    assert w.split_parts(segments, limit=4) == ["aaaa", "bbbb", "cc"]
    assert w.split_parts((), limit=4) == []


def test_format_duration() -> None:
    assert (w.format_duration(4.4), w.format_duration(59.6), w.format_duration(2_712)) == ("4 s", "1 min 00 s", "45 min 12 s")


# ── list_audio, whisper_info ────────────────────────────────────────────────


def test_list_audio_shows_virtual_paths_of_media_only(settings: w.Settings) -> None:
    listing = call(w.build_server(settings, FakeTranscriber()), "list_audio", {})
    assert listing.splitlines() == ["/audio/daily.m4a  (0.0 MB)", "/audio/team/review.mp4  (0.0 MB)"]


def test_list_audio_when_empty_or_missing(tmp_path: Path) -> None:
    empty = tmp_path / "empty"
    empty.mkdir()
    assert "holds no audio or video file" in w.list_audio_files(w.Settings(empty, tmp_path / "out"))
    assert "is not available" in w.list_audio_files(w.Settings(tmp_path / "absent", tmp_path / "out"))


def test_whisper_info_names_folders_and_backend(settings: w.Settings) -> None:
    info = call(w.build_server(settings, FakeTranscriber()), "whisper_info", {})
    assert f"audio: /audio -> {settings.audio_dir}" in info
    assert f"transcripts: /transcripts -> {settings.out_dir}" in info
    assert "backend: fake" in info and "model: none" in info
    assert "microphone: off" in info
    assert "speaker: off" in info and "tts_backend: piper" in info


def test_local_transcriber_describes_without_loading(settings: w.Settings, monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setenv("HF_HUB_CACHE", str(tmp_path / "hub"))
    local = w.LocalTranscriber(settings)
    assert local.describe() == {"backend": "local", "model": "small", "device": "cpu", "compute_type": "int8", "model_cached": False, "model_loaded": False}
    (tmp_path / "hub/models--Systran--faster-whisper-small/snapshots/abc").mkdir(parents=True)
    (tmp_path / "hub/models--Systran--faster-whisper-small/snapshots/abc/model.bin").write_bytes(b"")
    assert local.describe()["model_cached"] is True


def cached(hub: Path, repo: str) -> None:
    snapshot = hub / f"models--{repo.replace('/', '--')}" / "snapshots" / "abc"
    snapshot.mkdir(parents=True)
    (snapshot / "model.bin").write_bytes(b"")


def test_model_cached_looks_for_the_repository_of_the_name(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setenv("HF_HUB_CACHE", str(tmp_path))
    cached(tmp_path, "Systran/faster-whisper-small.en")
    cached(tmp_path, "mobiuslabsgmbh/faster-whisper-large-v3-turbo")
    assert not w.model_cached("small"), "small.en is another model"
    assert not w.model_cached("large-v3"), "large-v3-turbo is another model"
    cached(tmp_path, "Systran/faster-whisper-small")
    assert w.model_cached("small") and w.model_cached("Systran/faster-whisper-small")
    folder = tmp_path / "converted"
    folder.mkdir()
    assert not w.model_cached(str(folder))
    (folder / "model.bin").write_bytes(b"")
    assert w.model_cached(str(folder))
    monkeypatch.delenv("HF_HUB_CACHE")
    monkeypatch.delenv("HF_HOME", raising=False)
    monkeypatch.setenv("XDG_CACHE_HOME", str(tmp_path / "xdg"))
    assert not w.model_cached("small")
    cached(tmp_path / "xdg" / "huggingface" / "hub", "Systran/faster-whisper-small")
    assert w.model_cached("small"), "the hub's default folder follows XDG_CACHE_HOME"


def test_model_cached_knows_the_names_faster_whisper_maps(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    pytest.importorskip("faster_whisper")
    monkeypatch.setenv("HF_HUB_CACHE", str(tmp_path))
    assert not w.model_cached("turbo")
    cached(tmp_path, "mobiuslabsgmbh/faster-whisper-large-v3-turbo")
    assert w.model_cached("turbo") and w.model_cached("large-v3-turbo")


def test_the_local_transcriber_turns_a_decoding_error_into_a_tool_error(settings: w.Settings, monkeypatch: pytest.MonkeyPatch) -> None:
    class Model:
        def transcribe(self, *args, **kwargs):
            raise RuntimeError("Invalid data found when processing input")

    local = w.LocalTranscriber(settings)
    monkeypatch.setattr(local, "_load", lambda: Model())
    with pytest.raises(ToolError, match="cannot transcribe daily.m4a: Invalid data found"):
        local.transcribe(settings.audio_dir / "daily.m4a", "", "", True)


class FakeTranscriptionClient:
    def __init__(self, result: object) -> None:
        self.result = result
        self.requests: list[dict] = []
        self.audio = self
        self.transcriptions = self

    def create(self, **request):
        self.requests.append({key: value for key, value in request.items() if key != "file"})
        return self.result


def test_the_compatible_transcriber_reads_the_segments_or_the_whole_text(settings: w.Settings, monkeypatch: pytest.MonkeyPatch) -> None:
    reply = types.SimpleNamespace
    client = FakeTranscriptionClient(reply(language="french", duration=4.0, text="Bonjour. Suite.",
                                           segments=[reply(start=0, end=2, text=" Bonjour."), reply(start=2, end=4, text=" Suite.")]))
    monkeypatch.setattr(w, "openai_client", lambda *args: client)
    server = w.build_server(w.Settings(settings.audio_dir, settings.out_dir, backend="http", base_url="http://host:8000/v1", model="x"))
    result = call(server, "transcribe_audio", {"path": "daily.m4a", "language": "fr", "vocabulary": "Orkeon"})
    assert result.startswith("Bonjour. Suite.\n\n[language french, 4 s, 2 words;"), "no language probability from such a backend"
    assert client.requests == [{"model": "x", "response_format": "verbose_json", "language": "fr", "prompt": "Orkeon"}]
    client.result = reply(language=None, duration=3.0, text=" Tout le texte.", segments=None)
    assert call(server, "transcribe_audio", {"path": "daily.m4a"}).startswith("Tout le texte.\n\n[language ?, 3 s, 3 words;")


def test_a_compatible_server_gets_no_key_unless_its_variable_is_named(monkeypatch: pytest.MonkeyPatch) -> None:
    made: list[dict] = []
    openai = types.ModuleType("openai")
    openai.OpenAI = lambda **arguments: made.append(arguments)  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "openai", openai)
    monkeypatch.setenv("OPENAI_API_KEY", "sk-real")
    monkeypatch.setenv("SPEACHES_KEY", "local-key")
    base = {"WHISPER_AUDIO_DIR": "/a", "WHISPER_OUT_DIR": "/t"}
    http = w.Settings.from_env({**base, "WHISPER_BACKEND": "http", "WHISPER_BASE_URL": "http://host:8000/v1"})
    w.openai_client(http.backend, http.base_url, http.api_key_var)
    named = w.Settings.from_env({**base, "TTS_BACKEND": "http", "TTS_BASE_URL": "http://host:8000/v1", "TTS_MODEL": "m",
                                 "TTS_VOICE": "v", "TTS_API_KEY_VAR": "SPEACHES_KEY"})
    w.openai_client(named.tts_backend, named.tts_base_url, named.tts_api_key_var)
    cloud = w.Settings.from_env({**base, "WHISPER_BACKEND": "openai"})
    w.openai_client(cloud.backend, cloud.base_url, cloud.api_key_var)
    assert [(m["api_key"], m["base_url"]) for m in made] == [
        ("none", "http://host:8000/v1"), ("local-key", "http://host:8000/v1"), ("sk-real", None)]


def test_openai_backend_without_key_is_a_clear_error(settings: w.Settings, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    cloud = w.OpenAiCompatibleTranscriber(w.Settings(settings.audio_dir, settings.out_dir, backend="openai", model="whisper-1", api_key_var="OPENAI_API_KEY"))
    with pytest.raises(ToolError, match="(OPENAI_API_KEY is not set|openai package is missing)"):
        cloud.transcribe(settings.audio_dir / "daily.m4a", "", "", True)


# ── The MCP contract, through the SDK's client ──────────────────────────────


def test_mcp_contract(settings: w.Settings) -> None:
    server = w.build_server(settings, FakeTranscriber())

    async def scenario() -> tuple[list[str], str, bool, str]:
        async with create_connected_server_and_client_session(server._mcp_server) as session:
            tools = await session.list_tools()
            ok = await session.call_tool("transcribe_audio", {"path": "/audio/daily.m4a"})
            bad = await session.call_tool("transcribe_audio", {"path": "/audio/../secret.wav"})
            return (
                sorted(t.name for t in tools.tools),
                ok.content[0].text,
                bad.isError,
                bad.content[0].text,
            )

    names, text, is_error, error = asyncio.run(scenario())
    assert names == ["list_audio", "record_and_transcribe", "speak", "stop_speaking", "transcribe_audio", "whisper_info"]
    assert text.startswith("Bonjour à tous. On commence.")
    assert is_error and "leaves /audio" in error
    schema = next(t for t in asyncio.run(list_tools(server)) if t.name == "transcribe_audio").inputSchema
    assert schema["required"] == ["path"]
    assert set(schema["properties"]) == {"path", "language", "vocabulary", "vad_filter"}


async def list_tools(server):
    async with create_connected_server_and_client_session(server._mcp_server) as session:
        return (await session.list_tools()).tools


def call(server, tool: str, arguments: dict) -> str:
    """Call a tool the way the client does and return its text; a ToolError is re-raised."""

    async def go():
        async with create_connected_server_and_client_session(server._mcp_server) as session:
            return await session.call_tool(tool, arguments)

    result = asyncio.run(go())  # raised outside the session, whose task group would wrap it
    if result.isError:
        raise ToolError(result.content[0].text)
    return result.content[0].text


# ── Dictation ───────────────────────────────────────────────────────────────

SPEECH = [0.2, -0.2] * 800  # 0.1 s at 16 kHz, RMS 0.2
QUIET = [0.001] * 1600  # 0.1 s, RMS 0.001


def blocks(*runs: tuple[list, int]) -> list[list]:
    return [block for block, count in runs for _ in range(count)]


def feed_all(detector: w.SilenceDetector, all_blocks: list[list]) -> int:
    """How many blocks the detector took before it said stop (that block included)."""
    for taken, block in enumerate(all_blocks, start=1):
        if not detector.feed(block):
            return taken
    return len(all_blocks)


def test_silence_detector_stops_after_the_silence_that_follows_speech() -> None:
    detector = w.SilenceDetector(max_seconds=60, silence_seconds=1.0)
    assert feed_all(detector, blocks((QUIET, 5), (SPEECH, 20), (QUIET, 30))) == 5 + 20 + 10
    assert detector.heard


def test_silence_detector_gives_up_without_speech_and_stops_at_the_maximum() -> None:
    assert feed_all(w.SilenceDetector(max_seconds=60, silence_seconds=1.0, start_seconds=2.0), blocks((QUIET, 100))) == 20
    assert feed_all(w.SilenceDetector(max_seconds=3, silence_seconds=1.0), blocks((SPEECH, 100))) == 30
    assert w.SilenceDetector(max_seconds=3, silence_seconds=1.0).feed([]) is True


class FakeRecorder:
    def __init__(self, samples: list, heard: bool = True) -> None:
        self.recording = w.Recording(samples=samples, heard=heard)
        self.detectors: list[w.SilenceDetector] = []

    def record(self, detector: w.SilenceDetector) -> w.Recording:
        self.detectors.append(detector)
        return self.recording


def test_record_and_transcribe_refuses_while_the_microphone_is_off(settings: w.Settings) -> None:
    with pytest.raises(ToolError, match="the microphone is off: start orkeon-code with ORKEON_CODE_VOICE=1"):
        call(w.build_server(settings, FakeTranscriber(), FakeRecorder(SPEECH)), "record_and_transcribe", {})


def test_record_and_transcribe_records_keeps_the_last_recording_and_returns_the_text(settings: w.Settings) -> None:
    on = w.Settings(settings.audio_dir, settings.out_dir, microphone=True, silence_rms=0.05)
    fake, recorder = FakeTranscriber(), FakeRecorder(SPEECH * 10)
    text = call(w.build_server(on, fake, recorder), "record_and_transcribe", {"max_seconds": 30, "silence_seconds": 1.5, "language": "fr"})
    assert text == "Bonjour à tous. On commence."
    detector = recorder.detectors[0]
    assert (detector.max_seconds, detector.silence_seconds, detector.threshold) == (30, 1.5, 0.05)
    audio = settings.out_dir / "dictation.wav"
    assert fake.calls == [(audio, "fr", "", True)]
    import wave
    with wave.open(str(audio)) as recorded:
        assert (recorded.getnchannels(), recorded.getsampwidth(), recorded.getframerate(), recorded.getnframes()) == (1, 2, 16_000, 16_000)
    assert (settings.out_dir / "dictation.txt").read_text(encoding="utf-8") == "Bonjour à tous. On commence.\n"


def test_record_and_transcribe_returns_nothing_when_nothing_was_heard(settings: w.Settings) -> None:
    on = w.Settings(settings.audio_dir, settings.out_dir, microphone=True)
    (settings.out_dir).mkdir(parents=True, exist_ok=True)
    (settings.out_dir / "dictation.txt").write_text("an older dictation\n", encoding="utf-8")
    fake = FakeTranscriber()
    assert call(w.build_server(on, fake, FakeRecorder(QUIET, heard=False)), "record_and_transcribe", {}) == ""
    assert fake.calls == []
    assert (settings.out_dir / "dictation.txt").read_text(encoding="utf-8") == "", "an old dictation is never sent again"


class FailingRecorder:
    def record(self, detector: w.SilenceDetector) -> w.Recording:
        raise ToolError("cannot record from the microphone: device busy")


def test_record_and_transcribe_stops_the_reading_and_never_leaves_an_old_request(settings: w.Settings) -> None:
    on = w.Settings(settings.audio_dir, settings.out_dir, microphone=True, speaker=True)
    settings.out_dir.mkdir(parents=True)
    (settings.out_dir / "dictation.txt").write_text("old request\n", encoding="utf-8")
    (settings.out_dir / "dictation.wav").write_bytes(b"old")
    player = FakePlayer()
    with pytest.raises(ToolError, match="device busy"):
        call(w.build_server(on, FakeTranscriber(), FailingRecorder(), player=player), "record_and_transcribe", {})
    assert player.events == ["stop"], "the microphone must not hear a reading still playing"
    assert (settings.out_dir / "dictation.txt").read_text(encoding="utf-8") == ""
    assert not (settings.out_dir / "dictation.wav").exists()


@pytest.mark.parametrize(("arguments", "message"), [({"max_seconds": 0}, "between 1 and 600"), ({"silence_seconds": 30}, "between 0.5 and 10")])
def test_record_and_transcribe_bounds(settings: w.Settings, arguments: dict, message: str) -> None:
    on = w.Settings(settings.audio_dir, settings.out_dir, microphone=True)
    with pytest.raises(ToolError, match=message):
        call(w.build_server(on, FakeTranscriber(), FakeRecorder(SPEECH)), "record_and_transcribe", arguments)


def test_settings_of_the_microphone() -> None:
    base = {"WHISPER_AUDIO_DIR": "/a", "WHISPER_OUT_DIR": "/t"}
    assert w.Settings.from_env(base).microphone is False
    on = w.Settings.from_env({**base, "WHISPER_MICROPHONE": "1", "WHISPER_SILENCE_RMS": "0.02"})
    assert (on.microphone, on.silence_rms) == (True, 0.02)
    with pytest.raises(SystemExit, match="expected a number above 0"):
        w.Settings.from_env({**base, "WHISPER_SILENCE_RMS": "-1"})
    with pytest.raises(SystemExit, match="expected a number"):
        w.Settings.from_env({**base, "WHISPER_SILENCE_RMS": "loud"})
    for endless in ("nan", "inf"):
        with pytest.raises(SystemExit, match="expected a number above 0"):
            w.Settings.from_env({**base, "WHISPER_SILENCE_RMS": endless})


def test_microphone_recorder_without_sounddevice_is_a_clear_error(monkeypatch: pytest.MonkeyPatch) -> None:
    import builtins
    real_import = builtins.__import__

    def no_sounddevice(name, *args, **kwargs):
        if name == "sounddevice":
            raise OSError("PortAudio library not found")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", no_sounddevice)
    with pytest.raises(ToolError, match="no microphone access \\(PortAudio library not found\\): run the server with the `voice` extra"):
        w.MicrophoneRecorder().record(w.SilenceDetector(5, 1))


def test_microphone_recorder_keeps_the_blocks_until_the_detector_stops(monkeypatch: pytest.MonkeyPatch) -> None:
    numpy = pytest.importorskip("numpy")
    opened: list[dict] = []

    class InputStream:
        def __init__(self, callback, **settings) -> None:
            self.callback = callback
            opened.append(settings)

        def __enter__(self):
            for _ in range(10):  # PortAudio's thread, played ahead: ten blocks of 0.1 s of speech
                self.callback(numpy.full((1600, 1), 0.25, dtype="float32"), 1600, None, None)
            return self

        def __exit__(self, *failure) -> bool:
            return False

    sounddevice = types.ModuleType("sounddevice")
    sounddevice.InputStream = InputStream  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "sounddevice", sounddevice)
    recording = w.MicrophoneRecorder().record(w.SilenceDetector(0.5, 1))
    assert recording.heard and len(recording.samples) == 8_000 and recording.samples[0] == 0.25
    assert opened == [{"samplerate": 16_000, "channels": 1, "dtype": "float32", "blocksize": 1_600}]


def test_microphone_recorder_says_when_the_device_sends_nothing(monkeypatch: pytest.MonkeyPatch) -> None:
    import queue

    class Silent(queue.Queue):
        def get(self, block=True, timeout=None):  # PortAudio's thread never calls back
            raise queue.Empty

    class InputStream:
        def __init__(self, callback, **settings) -> None:
            pass

        def __enter__(self):
            return self

        def __exit__(self, *failure) -> bool:
            return False

    sounddevice = types.ModuleType("sounddevice")
    sounddevice.InputStream = InputStream  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "sounddevice", sounddevice)
    monkeypatch.setattr(queue, "Queue", Silent)
    with pytest.raises(ToolError, match="cannot record from the microphone: the input device sent nothing for 5 s"):
        w.MicrophoneRecorder().record(w.SilenceDetector(5, 1))


# ── The http transport (docker mode) ────────────────────────────────────────


def test_settings_of_the_http_transport() -> None:
    base = {"WHISPER_AUDIO_DIR": "/a", "WHISPER_OUT_DIR": "/t"}
    default = w.Settings.from_env(base)
    assert (default.transport, default.http_host, default.http_port) == ("stdio", "127.0.0.1", 8765)
    assert default.http_allowed_hosts == ("127.0.0.1:*", "localhost:*", "host.docker.internal:*")
    http = w.Settings.from_env({**base, "WHISPER_TRANSPORT": "HTTP", "WHISPER_HTTP_HOST": "172.17.0.1", "WHISPER_HTTP_PORT": "9000",
                                "WHISPER_HTTP_ALLOWED_HOSTS": " host.docker.internal:9000 , 172.17.0.1:9000 "})
    assert (http.transport, http.http_host, http.http_port) == ("http", "172.17.0.1", 9000)
    assert http.http_allowed_hosts == ("host.docker.internal:9000", "172.17.0.1:9000")
    with pytest.raises(SystemExit, match="expected stdio or http"):
        w.Settings.from_env({**base, "WHISPER_TRANSPORT": "sse"})
    with pytest.raises(SystemExit, match="expected a port number"):
        w.Settings.from_env({**base, "WHISPER_HTTP_PORT": "70000"})
    with pytest.raises(SystemExit, match="WHISPER_HTTP_PORT='²': expected a port number"):
        w.Settings.from_env({**base, "WHISPER_HTTP_PORT": "²"})


def test_the_server_answers_json_without_sessions_on_http(settings: w.Settings) -> None:
    server = w.build_server(w.Settings(settings.audio_dir, settings.out_dir, transport="http", http_port=9001), FakeTranscriber())
    assert (server.settings.host, server.settings.port) == ("127.0.0.1", 9001)
    assert server.settings.json_response is True and server.settings.stateless_http is True
    assert "host.docker.internal:*" in server.settings.transport_security.allowed_hosts


def test_the_http_wrapper_fills_accept_and_drops_a_protocol_version_the_sdk_does_not_know() -> None:
    seen: list[list] = []

    async def app(scope, receive, send):
        seen.append(scope["headers"])

    wrapped = w.orkeon_http_compat(app, ("2025-06-18", "2025-11-25"))
    asyncio.run(wrapped({"type": "http", "headers": [(b"content-type", b"application/json"), (b"mcp-protocol-version", b"2026-07-28")]}, None, None))
    asyncio.run(wrapped({"type": "http", "headers": [(b"accept", b"application/json"), (b"mcp-protocol-version", b"2025-06-18")]}, None, None))
    asyncio.run(wrapped({"type": "lifespan", "headers": []}, None, None))
    assert seen == [
        [(b"content-type", b"application/json"), (b"accept", b"application/json, text/event-stream")],
        [(b"accept", b"application/json"), (b"mcp-protocol-version", b"2025-06-18")],
        [],
    ]


# ── GPU ─────────────────────────────────────────────────────────────────────


def test_preload_cuda_libraries_without_the_cuda_extra_loads_nothing(monkeypatch: pytest.MonkeyPatch) -> None:
    import importlib
    real = importlib.import_module

    def no_nvidia(name, *args, **kwargs):
        if name.startswith("nvidia"):
            raise ImportError(name)
        return real(name, *args, **kwargs)

    monkeypatch.setattr(importlib, "import_module", no_nvidia)
    assert w.preload_cuda_libraries() == []


def test_preload_cuda_libraries_stops_on_a_library_that_never_loads(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    import importlib
    import types
    (tmp_path / "lib").mkdir()
    (tmp_path / "lib" / "libbroken.so.12").write_bytes(b"not an ELF file")
    fake = types.SimpleNamespace(__path__=[str(tmp_path)])
    real = importlib.import_module
    monkeypatch.setattr(importlib, "import_module", lambda name, *a, **k: fake if name.startswith("nvidia") else real(name, *a, **k))
    assert w.preload_cuda_libraries() == []


def test_the_local_backend_preloads_the_cuda_libraries_for_a_gpu_only(settings: w.Settings, monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []
    monkeypatch.setattr(w, "preload_cuda_libraries", lambda: calls.append("preload") or [])
    import sys
    import types
    monkeypatch.setitem(sys.modules, "faster_whisper", types.SimpleNamespace(WhisperModel=lambda *a, **k: object()))
    w.LocalTranscriber(settings)._load()
    assert calls == []
    w.LocalTranscriber(w.Settings(settings.audio_dir, settings.out_dir, device="cuda", compute_type="float16"))._load()
    assert calls == ["preload"]


# ── Speech output ───────────────────────────────────────────────────────────

ANSWER = """# Résultat

J'ai modifié **deux fichiers** dans [le module](src/x.ts) :

- `src/commands/_lib/voice.ts` : le rendu
- *tests* mis à jour

```ts
const a = 1;
```

| Fichier | Lignes |
|---|---|
| a.ts | 3 |

Voir https://example.com/doc pour le détail
> Note : rien à faire
---
Le calcul 2*3 reste lisible et snake_case_name aussi"""


def test_speakable_text_reads_the_words_not_the_markdown() -> None:
    text, cut = w.speakable_text(ANSWER)
    assert text == (
        "Résultat. J'ai modifié deux fichiers dans le module : src/commands/_lib/voice.ts : le rendu. "
        "tests mis à jour. Voir pour le détail. Note : rien à faire. Le calcul 2*3 reste lisible et snake_case_name aussi."
    )
    assert cut == ""


def test_speakable_text_keeps_a_sentence_ending_at_the_limit_and_drops_tables_and_long_fences() -> None:
    text = "Un premier très long morceau ici. Deux petits. Trois."
    assert w.speakable_text(text, len("Un premier très long morceau ici. Deux petits.")) == (
        "Un premier très long morceau ici. Deux petits.", "at a sentence")
    assert w.speakable_text("Avant.\na | b\n---|---\n1 | 2\n3 | 4\n\nAprès.") == ("Avant. Après.", "")
    assert w.speakable_text("Voici.\n````python\nprint('```')\n````\nFin.") == ("Voici. Fin.", "")


def test_speakable_text_finds_a_table_by_its_delimiter_row_and_keeps_prose_with_pipes() -> None:
    assert w.speakable_text("| a | b |\n|:-:|--|\n| 1 | 2 |") == ("", "")
    assert w.speakable_text("Un.\n\nc | d\n:--|--:\n3 | 4") == ("Un.", "")
    assert w.speakable_text("A | B\n-|-\n1 | 2\n\nDeux.\n\nC | D\n---|---\n5 | 6") == ("Deux.", "")
    assert w.speakable_text("Soit a | b, le reste. Ou alors | seul.") == ("Soit a | b, le reste. Ou alors | seul.", "")


def test_speakable_text_cuts_at_a_sentence_or_short_and_reads_nothing_of_code_only() -> None:
    assert w.speakable_text("Phrase un. Phrase deux. Phrase trois est longue.", 30) == ("Phrase un. Phrase deux.", "at a sentence")
    assert w.speakable_text("Unmotsansfinniespacequidepasselalimite", 10) == ("Unmotsansf", "short")
    assert w.speakable_text("Version 3.14 est sortie hier", 10) == ("Version 3.", "short"), "a full stop inside a number ends no sentence"
    assert w.speakable_text("```\nonly code\n```") == ("", "")
    assert w.speakable_text("Question ?") == ("Question ?", "")


def tiny_wav(path: Path, seconds: float = 0.5, rate: int = 22_050) -> None:
    import wave
    with wave.open(str(path), "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(rate)
        out.writeframes(b"\0\0" * int(rate * seconds))


class FakeSynthesizer:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str]] = []

    def synthesize(self, text: str, voice: str, target: Path) -> None:
        self.calls.append((text, voice))
        tiny_wav(target, 2.0)

    def describe(self) -> dict[str, object]:
        return {"tts_backend": "fake", "tts_voice": "fake"}


class FakePlayer:
    def __init__(self) -> None:
        self.events: list[str] = []

    def play(self, path: Path, wait: bool) -> None:
        self.events.append(f"play {path.name} wait={wait}")

    def stop(self) -> None:
        self.events.append("stop")


def test_speak_with_the_speaker_off_writes_the_file_and_plays_nothing(settings: w.Settings) -> None:
    voice, player = FakeSynthesizer(), FakePlayer()
    result = call(w.build_server(settings, FakeTranscriber(), synthesizer=voice, player=player), "speak", {"text": ANSWER})
    assert result.startswith("[written to /transcripts/speech.wav (")
    assert result.endswith("characters, 2 s); not played: the speaker is off (WHISPER_SPEAKER=1)]")
    assert voice.calls[0][0].startswith("Résultat. J'ai modifié deux fichiers") and voice.calls[0][1] == ""
    assert player.events == []
    assert (settings.out_dir / "speech.wav").is_file() and not (settings.out_dir / ".speech.part.wav").exists()


def test_speak_with_the_speaker_on_cuts_the_previous_reading_then_plays(settings: w.Settings) -> None:
    on = w.Settings(settings.audio_dir, settings.out_dir, speaker=True, tts_max_chars=20)
    voice, player = FakeSynthesizer(), FakePlayer()
    server = w.build_server(on, FakeTranscriber(), synthesizer=voice, player=player)
    result = call(server, "speak", {"text": "Premier point. Second point plus long.", "voice": " en_US-lessac-medium ", "wait": True})
    assert result == "[read aloud: 14 characters, 2 s, cut at a sentence; /transcripts/speech.wav]"
    assert voice.calls == [("Premier point.", "en_US-lessac-medium")]
    assert player.events == ["stop", "play speech.wav wait=True"]
    assert call(server, "speak", {"text": "Encore."}).startswith("[reading aloud: 7 characters")
    assert call(server, "stop_speaking", {}) == "stopped"
    assert player.events[-3:] == ["stop", "play speech.wav wait=False", "stop"]
    hard = call(server, "speak", {"text": "Unmotsansfinniespacequidepasselalimite"})
    assert hard.startswith("[reading aloud: 20 characters, 2 s, cut short;"), "no sentence ends near the limit"


def test_speak_says_when_a_text_holds_nothing_to_read(settings: w.Settings) -> None:
    voice = FakeSynthesizer()
    result = call(w.build_server(settings, FakeTranscriber(), synthesizer=voice, player=FakePlayer()), "speak", {"text": "```\nx = 1\n```"})
    assert result == "[nothing to read: the text holds only code, tables or links]"
    assert voice.calls == []


class BrokenSynthesizer:
    """A backend that fails half-way (`reply` an exception) or answers with something that is not a wav."""

    def __init__(self, reply: bytes | Exception) -> None:
        self.reply = reply

    def synthesize(self, text: str, voice: str, target: Path) -> None:
        target.write_bytes(self.reply if isinstance(self.reply, bytes) else b"RIFF")
        if isinstance(self.reply, Exception):
            raise self.reply

    def describe(self) -> dict[str, object]:
        return {}


def test_a_failed_synthesis_keeps_the_last_speech_and_leaves_no_partial_file(settings: w.Settings) -> None:
    call(w.build_server(settings, FakeTranscriber(), synthesizer=FakeSynthesizer(), player=FakePlayer()), "speak", {"text": "Bonjour."})
    before = (settings.out_dir / "speech.wav").read_bytes()
    failures = (
        (BrokenSynthesizer(ToolError("cannot synthesize the text: connection reset")), "connection reset"),
        (BrokenSynthesizer(OSError("disk full")), "cannot synthesize the text: disk full"),
        (BrokenSynthesizer(b"<html>busy</html>"), "cannot read the synthesized audio"),
    )
    for broken, message in failures:
        with pytest.raises(ToolError, match=message):
            call(w.build_server(settings, FakeTranscriber(), synthesizer=broken, player=FakePlayer()), "speak", {"text": "Bonjour."})
        assert (settings.out_dir / "speech.wav").read_bytes() == before
        assert not (settings.out_dir / ".speech.part.wav").exists()


def test_settings_of_the_speech_output(tmp_path: Path) -> None:
    base = {"WHISPER_AUDIO_DIR": "/a", "WHISPER_OUT_DIR": "/t"}
    default = w.Settings.from_env(base)
    assert (default.speaker, default.tts_backend, default.tts_voice, default.tts_max_chars) == (False, "piper", "fr_FR-siwis-medium", 1200)
    assert default.tts_voice_dir == Path.home() / ".cache" / "orkeon-code" / "piper"
    on = w.Settings.from_env({**base, "WHISPER_SPEAKER": "1", "TTS_VOICE": "en_US-lessac-medium", "TTS_VOICE_DIR": str(tmp_path), "TTS_MAX_CHARS": "300"})
    assert (on.speaker, on.tts_voice, on.tts_voice_dir, on.tts_max_chars) == (True, "en_US-lessac-medium", tmp_path, 300)
    with pytest.raises(SystemExit, match="TTS_BACKEND='espeak': expected piper, openai, http"):
        w.Settings.from_env({**base, "TTS_BACKEND": "espeak"})
    for bad in ("0.5", "0", "12a", "inf", "²"):
        with pytest.raises(SystemExit, match="TTS_MAX_CHARS=.*expected a whole number above 0"):
            w.Settings.from_env({**base, "TTS_MAX_CHARS": bad})


class FakeRun:
    """subprocess.run as Piper answers it: the download writes the voice, the synthesis the wav."""

    def __init__(self, fail: str = "") -> None:
        self.commands: list[list[str]] = []
        self.inputs: list[bytes | None] = []
        self.fail = fail

    def __call__(self, command, input=None, capture_output=False, timeout=None):
        import subprocess
        self.commands.append(command[2:])
        self.inputs.append(input)
        if self.fail:
            return subprocess.CompletedProcess(command, 1, b"", self.fail.encode())
        if command[2] == "piper.download_voices":
            folder = Path(command[command.index("--data-dir") + 1])
            (folder / f"{command[-1]}.onnx").write_bytes(b"model")
        else:
            tiny_wav(Path(command[command.index("-f") + 1]))
        return subprocess.CompletedProcess(command, 0, b"", b"")


def test_piper_downloads_a_voice_once_then_synthesizes_from_stdin(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    run = FakeRun()
    monkeypatch.setattr(w.subprocess, "run", run)
    piper = w.PiperSynthesizer(w.Settings(tmp_path, tmp_path, tts_voice_dir=tmp_path / "voices"))
    assert piper.describe()["tts_voice_cached"] is False
    piper.synthesize("Bonjour.", "", tmp_path / "a.wav")
    piper.synthesize("Encore.", "", tmp_path / "b.wav")
    model = str(tmp_path / "voices" / "fr_FR-siwis-medium.onnx")
    assert run.commands == [
        ["piper.download_voices", "--data-dir", str(tmp_path / "voices"), "fr_FR-siwis-medium"],
        ["piper", "-m", model, "-f", str(tmp_path / "a.wav")],
        ["piper", "-m", model, "-f", str(tmp_path / "b.wav")],
    ]
    assert run.inputs[1:] == ["Bonjour.".encode(), "Encore.".encode()]
    assert piper.describe()["tts_voice_cached"] is True


def test_piper_describes_a_voice_given_as_a_model_path(tmp_path: Path) -> None:
    model = tmp_path / "custom.onnx"
    piper = w.PiperSynthesizer(w.Settings(tmp_path, tmp_path, tts_voice=str(model)))
    assert piper.describe() == {"tts_backend": "piper", "tts_voice": str(model), "tts_voice_cached": False}
    model.write_bytes(b"model")
    assert piper.describe()["tts_voice_cached"] is True


def test_piper_says_what_is_missing(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    piper = w.PiperSynthesizer(w.Settings(tmp_path, tmp_path, tts_voice_dir=tmp_path))
    for missing in (  # what Python prints for the download (the first run), then for the synthesis
        "/usr/bin/python3: Error while finding module specification for 'piper.download_voices' "
        "(ModuleNotFoundError: No module named 'piper')",
        "/usr/bin/python3: No module named piper",
    ):
        monkeypatch.setattr(w.subprocess, "run", FakeRun(fail=missing))
        with pytest.raises(ToolError, match="Piper is not installed: run the server with the `tts` extra"):
            piper.synthesize("Bonjour.", "", tmp_path / "a.wav")
    monkeypatch.setattr(w.subprocess, "run", FakeRun(fail="RuntimeError: unknown voice"))
    with pytest.raises(ToolError, match="cannot download the Piper voice xx_XX-none: RuntimeError: unknown voice"):
        piper.synthesize("Bonjour.", "xx_XX-none", tmp_path / "a.wav")
    with pytest.raises(ToolError, match="no Piper model at /nowhere/voice.onnx"):
        piper.synthesize("Bonjour.", "/nowhere/voice.onnx", tmp_path / "a.wav")


def test_speaker_without_sounddevice_is_a_clear_error(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    import builtins
    real_import = builtins.__import__

    def no_sounddevice(name, *args, **kwargs):
        if name == "sounddevice":
            raise OSError("PortAudio library not found")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", no_sounddevice)
    tiny_wav(tmp_path / "s.wav")
    with pytest.raises(ToolError, match="no speaker access \\(PortAudio library not found\\)"):
        w.SpeakerPlayer().play(tmp_path / "s.wav", False)
    w.SpeakerPlayer().stop()  # stopping without a device is not an error


def test_speaker_plays_the_wav_as_floats_and_waits_when_asked(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    pytest.importorskip("numpy")
    played: list[object] = []
    sounddevice = types.ModuleType("sounddevice")
    sounddevice.play = lambda samples, rate: played.append((samples.shape, str(samples.dtype), rate))  # type: ignore[attr-defined]
    sounddevice.wait = lambda: played.append("wait")  # type: ignore[attr-defined]
    sounddevice.stop = lambda: played.append("stop")  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "sounddevice", sounddevice)
    tiny_wav(tmp_path / "s.wav", 0.5)
    w.SpeakerPlayer().play(tmp_path / "s.wav", True)
    w.SpeakerPlayer().play(tmp_path / "s.wav", False)
    w.SpeakerPlayer().stop()
    assert played == [((11_025,), "float32", 22_050), "wait", ((11_025,), "float32", 22_050), "stop"]
    import wave
    with wave.open(str(tmp_path / "8bit.wav"), "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(1)
        out.setframerate(8_000)
        out.writeframes(b"\x80" * 800)
    with pytest.raises(ToolError, match="8-bit audio, 16-bit expected"):
        w.SpeakerPlayer().play(tmp_path / "8bit.wav", False)


# ── Speech output over OpenAI's API or a compatible server ──────────────────


def test_settings_of_the_openai_and_http_speech_backends() -> None:
    base = {"WHISPER_AUDIO_DIR": "/a", "WHISPER_OUT_DIR": "/t"}
    cloud = w.Settings.from_env({**base, "TTS_BACKEND": "openai"})
    assert (cloud.tts_backend, cloud.tts_model, cloud.tts_voice, cloud.tts_api_key_var) == ("openai", "gpt-4o-mini-tts", "alloy", "OPENAI_API_KEY")
    local = w.Settings.from_env({**base, "TTS_BACKEND": "http", "TTS_BASE_URL": "http://host:8000/v1",
                                 "TTS_MODEL": "speaches-ai/Kokoro-82M-v1.0-ONNX", "TTS_VOICE": "ff_siwis"})
    assert (local.tts_base_url, local.tts_model, local.tts_voice) == ("http://host:8000/v1", "speaches-ai/Kokoro-82M-v1.0-ONNX", "ff_siwis")
    with pytest.raises(SystemExit, match="TTS_BACKEND=http needs TTS_BASE_URL, TTS_MODEL, TTS_VOICE"):
        w.Settings.from_env({**base, "TTS_BACKEND": "http"})


class FakeSpeechClient:
    def __init__(self, reply: bytes | Exception) -> None:
        self.requests: list[dict] = []
        self.reply = reply
        self.audio = self
        self.speech = self

    def create(self, **request):
        self.requests.append(request)
        if isinstance(self.reply, Exception):
            raise self.reply
        import types
        return types.SimpleNamespace(content=self.reply)


def wav_bytes(seconds: float, rate: int = 24_000, streamed: bool = False) -> bytes:
    import io
    import wave
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(rate)
        out.writeframes(b"\0\0" * int(rate * seconds))
    data = bytearray(buffer.getvalue())
    if streamed:  # what a server that streams writes: sizes it cannot know
        data[4:8] = (0xFFFFFFFF).to_bytes(4, "little")
        data[40:44] = (0xFFFFFFFF).to_bytes(4, "little")
    return bytes(data)


def test_the_compatible_backend_asks_for_a_wav_and_keeps_it(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    client = FakeSpeechClient(wav_bytes(1.5))
    made: list[tuple] = []
    monkeypatch.setattr(w, "openai_client", lambda *a: made.append(a) or client)
    settings = w.Settings(tmp_path, tmp_path, tts_backend="http", tts_base_url="http://host:8000/v1",
                          tts_model="speaches-ai/Kokoro-82M-v1.0-ONNX", tts_voice="ff_siwis")
    voice = w.OpenAiCompatibleSynthesizer(settings)
    voice.synthesize("Bonjour.", "", tmp_path / "a.wav")
    voice.synthesize("Hello.", "af_heart", tmp_path / "b.wav")
    assert made == [("http", "http://host:8000/v1", "")], "one client, made once, with no key named"
    assert client.requests == [
        {"model": "speaches-ai/Kokoro-82M-v1.0-ONNX", "voice": "ff_siwis", "input": "Bonjour.", "response_format": "wav"},
        {"model": "speaches-ai/Kokoro-82M-v1.0-ONNX", "voice": "af_heart", "input": "Hello.", "response_format": "wav"},
    ]
    assert round(w.wav_seconds(tmp_path / "a.wav"), 1) == 1.5
    assert voice.describe()["tts_base_url"] == "http://host:8000/v1"


def test_the_compatible_backend_reports_a_failed_request(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setattr(w, "openai_client", lambda *a: FakeSpeechClient(RuntimeError("model not installed")))
    voice = w.OpenAiCompatibleSynthesizer(w.Settings(tmp_path, tmp_path, tts_backend="openai", tts_model="tts-1", tts_voice="alloy"))
    with pytest.raises(ToolError, match="cannot synthesize the text: model not installed"):
        voice.synthesize("Bonjour.", "", tmp_path / "a.wav")


def test_the_openai_speech_backend_without_a_key_is_a_clear_error(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    voice = w.OpenAiCompatibleSynthesizer(w.Settings(tmp_path, tmp_path, tts_backend="openai", tts_model="tts-1", tts_voice="alloy",
                                                     tts_api_key_var="OPENAI_API_KEY"))
    with pytest.raises(ToolError, match="(OPENAI_API_KEY is not set|openai package is missing)"):
        voice.synthesize("Bonjour.", "", tmp_path / "a.wav")


def test_wav_seconds_counts_a_streamed_wav_by_its_size(tmp_path: Path) -> None:
    (tmp_path / "s.wav").write_bytes(wav_bytes(2.0, streamed=True))
    assert round(w.wav_seconds(tmp_path / "s.wav"), 1) == 2.0
    (tmp_path / "n.wav").write_bytes(wav_bytes(0.5))
    assert round(w.wav_seconds(tmp_path / "n.wav"), 1) == 0.5
