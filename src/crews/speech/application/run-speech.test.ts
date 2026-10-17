// The speech crew's use case over a FakeToolCatalogue. Run:
//   node --test src/crews/speech/application/run-speech.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, rejects, strictEqual } from "node:assert";
import { runSpeech } from "./run-speech.ts";
import { FakeLogger } from "../../../../tests/support/fake-logger.ts";
import { FakeToolCatalogue } from "../../../../tests/support/fake-tool-catalogue.ts";

function setup(reply: unknown) {
  const tools = new FakeToolCatalogue();
  tools.tools.set("transcribe_audio", reply);
  const log = new FakeLogger();
  return { tools, log, deps: { tools, log } };
}

describe("runSpeech", () => {
  it("makes the call the command named and answers the tool's text", async () => {
    const { tools, log, deps } = setup("Bonjour.\n\n[language fr (0.99), 3 s, 1 words; written to /transcripts/a.txt]\n");
    const input = { tool: "transcribe_audio", args: { path: "/audio/a.m4a", language: "fr" }, label: "transcription of /audio/a.m4a" };
    strictEqual(await runSpeech(input, deps), "Bonjour.\n\n[language fr (0.99), 3 s, 1 words; written to /transcripts/a.txt]");
    deepStrictEqual(tools.calls, [{ name: "transcribe_audio", args: { path: "/audio/a.m4a", language: "fr" } }]);
    deepStrictEqual(log.lines, ["info: transcription of /audio/a.m4a: transcribe_audio"]);
  });

  it("reads a result that is not a string, and says when there is no text", async () => {
    strictEqual(await runSpeech({ tool: "transcribe_audio" }, setup({ text: "Salut." }).deps), "Salut.");
    strictEqual(await runSpeech({ tool: "transcribe_audio" }, setup("  ").deps), "transcribe_audio returned nothing");
  });

  it("throws the tool's failure, and refuses an input that names no tool", async () => {
    const wrapped = new Error("tools.transcribeAudio failed [path=/audio/x.m4a]: Error executing tool transcribe_audio: no file at /audio/x.m4a");
    await rejects(runSpeech({ tool: "transcribe_audio" }, setup(wrapped).deps), (e: Error) => String(e) === "transcribe_audio: no file at /audio/x.m4a");
    await rejects(runSpeech({}, setup("").deps), /no tool to call: this crew is started by \/transcribe, \/voice or \/say/);
  });
});
