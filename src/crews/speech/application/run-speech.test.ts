// The speech crew's use case over a FakeToolCatalogue. Run:
//   node --test src/crews/speech/application/run-speech.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, rejects, strictEqual } from "node:assert";
import { runSpeech } from "./run-speech.ts";
import { TRANSCRIPT, WRAPPED_FAILURE, speechSetup } from "./run-speech.fixtures.ts";

describe("runSpeech", () => {
  it("makes the call the command named and answers the tool's text", async () => {
    // Arrange
    const { tools, log, deps } = speechSetup(`${TRANSCRIPT}\n`);
    const input = { tool: "transcribe_audio", args: { path: "/audio/a.m4a", language: "fr" }, label: "transcription of /audio/a.m4a" };

    // Act
    const out = await runSpeech(input, deps);

    // Assert
    strictEqual(out, TRANSCRIPT);
    deepStrictEqual(tools.calls, [{ name: "transcribe_audio", args: { path: "/audio/a.m4a", language: "fr" } }]);
    deepStrictEqual(log.lines, ["info: transcription of /audio/a.m4a: transcribe_audio"]);
  });

  it("reads a result that is not a string", async () => {
    // Arrange
    const { deps } = speechSetup({ text: "Salut." });

    // Act
    const out = await runSpeech({ tool: "transcribe_audio" }, deps);

    // Assert
    strictEqual(out, "Salut.");
  });

  it("says when there is no text", async () => {
    // Arrange
    const { deps } = speechSetup("  ");

    // Act
    const out = await runSpeech({ tool: "transcribe_audio" }, deps);

    // Assert
    strictEqual(out, "transcribe_audio returned nothing");
  });

  it("throws the tool's failure", async () => {
    // Arrange
    const { deps } = speechSetup(WRAPPED_FAILURE);

    // Act
    const act = runSpeech({ tool: "transcribe_audio" }, deps);

    // Assert
    await rejects(act, (e: Error) => String(e) === "transcribe_audio: no file at /audio/x.m4a");
  });

  it("refuses an input that names no tool", async () => {
    // Arrange
    const { deps } = speechSetup("");

    // Act
    const act = runSpeech({}, deps);

    // Assert
    await rejects(act, /no tool to call: this crew is started by \/transcribe, \/voice or \/say/);
  });
});
