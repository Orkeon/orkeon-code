// commands/_lib/speech/transcribe.ts: the arguments of /transcribe, and what it launches
// over a FakeCrewHost and a FakeToolCatalogue: the speech crew for a file or the
// listing, the main loop with the transcription as its prelude for --then. Run:
//   node --test tests/commands/_lib/speech/transcribe.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";
import { audioPath, dispatchTranscribe, parseTranscribeArgs } from "../../../../src/commands/_lib/speech/transcribe.ts";
import type { MainLoopInputs } from "../../../../src/crews/main-loop/application/run-main-loop.ts";
import { FILE_CASES, NOTHING_LAUNCHED_CASES, REFUSED_CASES, transcribeDeps } from "./transcribe.fixtures.ts";

describe("parseTranscribeArgs", () => {
  for (const c of FILE_CASES) {
    it(c.name, () => {
      // Arrange
      const { tokens } = c;

      // Act
      const parsed = parseTranscribeArgs(tokens);

      // Assert
      deepStrictEqual(parsed, c.expected, c.message);
    });
  }

  it("places a relative path under /audio", () => {
    // Arrange
    const relative = "team/a.wav";

    // Act
    const path = audioPath(relative);

    // Assert
    strictEqual(path, "/audio/team/a.wav");
  });

  it("reads --list alone", () => {
    // Arrange
    const tokens = ["--list"];

    // Act
    const parsed = parseTranscribeArgs(tokens);

    // Assert
    deepStrictEqual(parsed, { ok: true, request: { kind: "list" } });
  });

  for (const c of REFUSED_CASES) {
    it(`${c.name}, with the reason`, () => {
      // Arrange
      const { tokens } = c;

      // Act
      const parsed = parseTranscribeArgs(tokens);

      // Assert
      strictEqual(parsed.ok ? "" : parsed.error, c.error);
    });
  }
});

describe("dispatchTranscribe", () => {
  it("launches the speech crew with the call, under the name the host registers", async () => {
    // Arrange
    const { crews, deps } = transcribeDeps("Transcribe_Audio", "list_audio");

    // Act
    const result = await dispatchTranscribe(["daily.m4a", "--lang", "fr", "--prompt", "Orkeon"], deps);

    // Assert
    deepStrictEqual(result, { ticket: "ticket-1" });
    deepStrictEqual(crews.launches, [{
      name: "speech",
      input: { tool: "Transcribe_Audio", args: { path: "/audio/daily.m4a", language: "fr", vocabulary: "Orkeon" }, label: "transcription of /audio/daily.m4a" },
    }]);
  });

  it("passes only the arguments given", async () => {
    // Arrange
    const { crews, deps } = transcribeDeps("transcribe_audio", "list_audio");

    // Act
    await dispatchTranscribe(["a.wav"], deps);

    // Assert
    deepStrictEqual(crews.launches.map((l) => l.input), [
      { tool: "transcribe_audio", args: { path: "/audio/a.wav" }, label: "transcription of /audio/a.wav" },
    ]);
  });

  it("lists /audio with list_audio", async () => {
    // Arrange
    const { crews, deps } = transcribeDeps("transcribe_audio", "list_audio");

    // Act
    await dispatchTranscribe(["--list"], deps);

    // Assert
    deepStrictEqual(crews.launches.map((l) => l.input), [
      { tool: "list_audio", args: {}, label: "the files under /audio" },
    ]);
  });

  it("with --then, launches the main loop with the transcription as its prelude, in the mode the instruction names", async () => {
    // Arrange
    const { crews, deps } = transcribeDeps("transcribe_audio");

    // Act
    await dispatchTranscribe(["daily.m4a", "--lang", "fr", "--then", "plan: list the tasks I mention"], deps);

    // Assert
    strictEqual(crews.launches.length, 1);
    strictEqual(crews.launches[0].name, "main-loop");
    const input = crews.launches[0].input as MainLoopInputs;
    strictEqual(input.prompt, "list the tasks I mention");
    strictEqual(input.permissionMode, "plan");
    deepStrictEqual(input.prelude, {
      tool: "transcribe_audio", args: { path: "/audio/daily.m4a", language: "fr" },
      label: "Transcription of /audio/daily.m4a, made by /transcribe before this request",
    });
  });

  for (const c of NOTHING_LAUNCHED_CASES) {
    it(`launches nothing on ${c.name}, and says why`, async () => {
      // Arrange
      const { crews, deps } = transcribeDeps();

      // Act
      const result = await dispatchTranscribe(c.tokens, deps);

      // Assert
      deepStrictEqual(result, { message: c.message });
      deepStrictEqual(crews.launches, []);
    });
  }
});
