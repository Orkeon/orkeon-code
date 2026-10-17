// voice.reply and its epilogue. Run:
//   node --test src/shared/domain/speech.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";
import { SPEAK_TOOL, VOICE_REPLY_CONFIG_KEY, voiceReplyEpilogue, voiceReplyOn } from "./speech.ts";
import { epilogueArgs } from "./prelude.ts";

describe("voice.reply", () => {
  it("is on for 'on' alone, in any case and spacing", () => {
    strictEqual(VOICE_REPLY_CONFIG_KEY, "voice.reply");
    for (const value of ["on", " ON ", "On"]) strictEqual(voiceReplyOn(value), true, value);
    for (const value of [undefined, "", "off", "true", "yes"]) strictEqual(voiceReplyOn(value), false, String(value));
  });

  it("reads the answer aloud with speak, under its registered name", () => {
    strictEqual(SPEAK_TOOL, "speak");
    const epilogue = voiceReplyEpilogue("Speak");
    deepStrictEqual(epilogue, { tool: "Speak", args: {}, textArg: "text", label: "Reply read aloud" });
    deepStrictEqual(epilogueArgs(epilogue, "Paris."), { text: "Paris." });
  });
});
