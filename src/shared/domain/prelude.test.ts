// The prelude of a crew input: its parsing, a tool result as text, the request
// the model reads. Run:
//   node --test src/shared/domain/prelude.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";
import {
  applyPrelude, epilogueArgs, failureText, nothingReturned, parseEpilogue, parsePrelude, resultText, toolFailure, withPrelude,
} from "./prelude.ts";

describe("parsePrelude", () => {
  it("reads the tool, its arguments and its label", () => {
    deepStrictEqual(
      parsePrelude({ tool: " transcribe_audio ", args: { path: "/audio/a.m4a" }, label: " Transcription of /audio/a.m4a " }),
      { tool: "transcribe_audio", args: { path: "/audio/a.m4a" }, label: "Transcription of /audio/a.m4a" },
    );
  });

  it("is null without a tool, and for anything but an object", () => {
    for (const value of [undefined, null, "transcribe_audio", 3, [], {}, { tool: "  " }, { tool: 7 }]) {
      strictEqual(parsePrelude(value), null, JSON.stringify(value));
    }
  });

  it("takes arguments that are not an object as none, and a blank label as the tool's name", () => {
    deepStrictEqual(parsePrelude({ tool: "list_audio", args: ["x"], label: " " }), { tool: "list_audio", args: {}, label: "list_audio" });
    deepStrictEqual(parsePrelude({ tool: "list_audio", args: null }), { tool: "list_audio", args: {}, label: "list_audio" });
  });
});

describe("resultText", () => {
  it("keeps a string, picks a text field, and falls back to JSON", () => {
    strictEqual(resultText("bonjour"), "bonjour");
    strictEqual(resultText({ text: "a" }), "a");
    strictEqual(resultText({ Content: "b" }), "b");
    strictEqual(resultText({ result: "c", text: 1 }), "c");
    strictEqual(resultText({ segments: [1] }), '{"segments":[1]}');
    strictEqual(resultText(42), "42");
    strictEqual(resultText(undefined), "");
    strictEqual(resultText(null), "");
  });
});

describe("withPrelude", () => {
  it("puts the result under its label after the request", () => {
    strictEqual(
      withPrelude(" list the tasks ", "Transcription of /audio/a.m4a", "\nOn livre lundi.\n"),
      "list the tasks\n\nTranscription of /audio/a.m4a:\nOn livre lundi.",
    );
  });
});

describe("failureText", () => {
  it("keeps the tool's own message, without the runtime's wrapping", () => {
    const own = "no file at /audio/nope.wav (list_audio shows what /audio holds)";
    strictEqual(failureText(new Error(`tools.transcribeAudio failed [path=/audio/nope.wav]: Error executing tool transcribe_audio: ${own}`)), own);
    strictEqual(failureText(new Error(`One or more errors occurred. (tools.transcribeAudio failed [path=/audio/nope.wav]: Error executing tool transcribe_audio: ${own})`)), own);
    strictEqual(failureText(new Error("tools.listAudio failed [x=1]: server gone")), "server gone");
    strictEqual(failureText("plain (with parentheses)"), "plain (with parentheses)");
    strictEqual(failureText(new Error(`Error executing tool transcribe_audio: ${own})\n ---> System.InvalidOperationException: tools.x failed`)), own);
  });

  it("names the error after the tool, so it reads '<tool>: <message>'", () => {
    const failure = toolFailure("transcribe_audio", new Error("Error executing tool transcribe_audio: no file at /audio/a.wav"));
    strictEqual(String(failure), "transcribe_audio: no file at /audio/a.wav");
    strictEqual(failure.message, "no file at /audio/a.wav");
  });
});

describe("applyPrelude", () => {
  it("makes the text the request for as: request, after a request typed, and appends it otherwise", () => {
    const dictation = { tool: "record_and_transcribe", args: {}, label: "Dictation", as: "request" as const };
    strictEqual(applyPrelude("", dictation, " fix the parser \n"), "fix the parser");
    strictEqual(applyPrelude("context:", dictation, "fix the parser"), "context:\n\nfix the parser");
    strictEqual(applyPrelude("", dictation, "  "), "");
    strictEqual(applyPrelude("list the tasks", { tool: "t", args: {}, label: "Transcription" }, "On livre."), "list the tasks\n\nTranscription:\nOn livre.");
    deepStrictEqual(parsePrelude({ tool: "record_and_transcribe", as: "request" }), { tool: "record_and_transcribe", args: {}, label: "record_and_transcribe", as: "request" });
    deepStrictEqual(parsePrelude({ tool: "t", as: "other" }), { tool: "t", args: {}, label: "t" });
    strictEqual(nothingReturned("record_and_transcribe"), "record_and_transcribe returned nothing");
  });
});

describe("parseEpilogue", () => {
  it("reads the tool, its arguments, the argument the answer goes in, and the label", () => {
    deepStrictEqual(parseEpilogue({ tool: "speak", args: { voice: "v" }, textArg: " text ", label: "L" }),
      { tool: "speak", args: { voice: "v" }, textArg: "text", label: "L" });
    deepStrictEqual(parseEpilogue({ tool: "notify" }), { tool: "notify", args: {}, textArg: "text", label: "notify" });
    strictEqual(parseEpilogue({ args: {} }), null);
    strictEqual(parseEpilogue(undefined), null);
    deepStrictEqual(epilogueArgs({ tool: "notify", args: { voice: "v", text: "old" }, textArg: "message", label: "L" }, "new"),
      { voice: "v", text: "old", message: "new" });
  });
});
