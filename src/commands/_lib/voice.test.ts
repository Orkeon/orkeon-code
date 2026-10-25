// commands/_lib/voice.ts: the arguments of /voice, what it launches over a
// FakeCrewHost and a FakeToolCatalogue (the speech crew to show a dictation,
// the main loop to send it, at once with --go), and the lines its completion
// writes. Run:
//   node --test src/commands/_lib/voice.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";
import {
  DICTATION_FILE, dispatchVoice, parseVoiceArgs, recordingNotice, renderVoiceCompletion,
} from "./voice.ts";
import { missingToolMessage } from "./transcribe.ts";
import type { MainLoopInputs } from "../../crews/main-loop/application/run-main-loop.ts";
import {
  ACCEPTED_CASES, COMPLETION_CASES, MAX_ZERO_MESSAGE, NO_DICTATION, NOTICE_CASES, REFUSED_CASES, voiceDeps,
} from "./voice.fixtures.ts";

describe("parseVoiceArgs", () => {
  for (const c of ACCEPTED_CASES) {
    it(c.name, () => {
      // Arrange
      const { tokens } = c;

      // Act
      const parsed = parseVoiceArgs(tokens);

      // Assert
      deepStrictEqual(parsed, c.expected);
    });
  }

  for (const c of REFUSED_CASES) {
    it(`${c.name}, with the reason`, () => {
      // Arrange
      const { tokens } = c;

      // Act
      const parsed = parseVoiceArgs(tokens);

      // Assert
      strictEqual(parsed.ok ? "" : parsed.error, c.error, c.message);
    });
  }

  for (const c of NOTICE_CASES) {
    it(c.name, () => {
      // Arrange
      const { request } = c;

      // Act
      const notice = recordingNotice(request);

      // Assert
      strictEqual(notice, c.expected);
    });
  }
});

describe("dispatchVoice", () => {
  it("shows the notice and launches the speech crew with the recording call", async () => {
    // Arrange
    const { crews, lines, deps } = voiceDeps(["record_and_transcribe", ""]);

    // Act
    const result = await dispatchVoice(["--lang", "fr", "--prompt", "Orkeon"], deps);

    // Assert
    deepStrictEqual(result, { ticket: "ticket-1" });
    deepStrictEqual(lines, ["🎙 recording: speak, then stay silent 2 s to stop (60 s at most)"]);
    deepStrictEqual(crews.launches, [{
      name: "speech",
      input: {
        tool: "record_and_transcribe", args: { max_seconds: 60, silence_seconds: 2, language: "fr", vocabulary: "Orkeon" }, label: "dictation",
      },
    }]);
  });

  it("with --go, launches the main loop with the dictation as the request itself", async () => {
    // Arrange
    const { crews, deps } = voiceDeps(["Record_And_Transcribe", ""]);

    // Act
    await dispatchVoice(["--go", "--max", "20"], deps);

    // Assert
    strictEqual(crews.launches[0].name, "main-loop");
    const input = crews.launches[0].input as MainLoopInputs;
    strictEqual(input.prompt, "");
    deepStrictEqual(input.prelude, { tool: "Record_And_Transcribe", args: { max_seconds: 20, silence_seconds: 2 }, label: "Dictation", as: "request" });
  });

  it("send reads the last dictation and sends it as /assistant would, mode prefix included", async () => {
    // Arrange
    const { crews, files, deps } = voiceDeps();
    files.files.set(DICTATION_FILE, "plan: explain the cache layer\n");

    // Act
    await dispatchVoice(["send"], deps);

    // Assert
    const input = crews.launches[0].input as MainLoopInputs;
    deepStrictEqual([crews.launches[0].name, input.prompt, input.permissionMode], ["main-loop", "explain the cache layer", "plan"]);
  });

  it("launches nothing on an empty dictation, and says why", async () => {
    // Arrange
    const { crews, files, deps } = voiceDeps();
    files.files.set(DICTATION_FILE, "\n");

    // Act
    const result = await dispatchVoice(["send"], deps);

    // Assert
    deepStrictEqual(result, { message: NO_DICTATION });
    deepStrictEqual(crews.launches, []);
  });

  it("launches nothing when no dictation file exists yet, and says why", async () => {
    // Arrange
    const { crews, deps } = voiceDeps();

    // Act
    const result = await dispatchVoice(["send"], deps);

    // Assert
    deepStrictEqual(result, { message: NO_DICTATION }, "no dictation file yet");
    deepStrictEqual(crews.launches, []);
  });

  it("launches nothing on a dictation file that cannot be read, and says why", async () => {
    // Arrange
    const { crews, files, deps } = voiceDeps();
    files.readErrors.set(DICTATION_FILE, new Error("permission denied"));

    // Act
    const result = await dispatchVoice(["send"], deps);

    // Assert
    deepStrictEqual(result, { message: `cannot read ${DICTATION_FILE}: permission denied` },
      "a file that cannot be read is not a missing one");
    deepStrictEqual(crews.launches, []);
  });

  it("launches nothing without the server, says what to set, and shows no notice", async () => {
    // Arrange
    const { crews, lines, deps } = voiceDeps();

    // Act
    const result = await dispatchVoice([], deps);

    // Assert
    deepStrictEqual(result, { message: missingToolMessage("record_and_transcribe") });
    deepStrictEqual(lines, [], "no notice when nothing records");
    deepStrictEqual(crews.launches, []);
  });

  it("launches nothing on a bad line, with the usage", async () => {
    // Arrange
    const { crews, deps } = voiceDeps();

    // Act
    const result = await dispatchVoice(["--max", "0"], deps);

    // Assert
    deepStrictEqual(result, { message: MAX_ZERO_MESSAGE });
    deepStrictEqual(crews.launches, []);
  });
});

describe("renderVoiceCompletion", () => {
  for (const c of COMPLETION_CASES) {
    it(c.name, () => {
      // Arrange
      const { completion } = c;

      // Act
      const lines = renderVoiceCompletion(completion);

      // Assert
      deepStrictEqual(lines, c.expected, c.message);
    });
  }
});
