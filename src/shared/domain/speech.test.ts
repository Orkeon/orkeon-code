// voice.reply and its epilogue. Run:
//   node --test src/shared/domain/speech.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";
import { SPEAK_TOOL, VOICE_REPLY_CONFIG_KEY, voiceReplyEpilogue, voiceReplyOn } from "./speech.ts";
import { epilogueArgs } from "./prelude.ts";
import { OFF_VALUES, ON_VALUES } from "./speech.fixtures.ts";

describe("voice.reply", () => {
  it("is read under the session key voice.reply", () => {
    // Arrange
    const expected = "voice.reply";

    // Act
    const key = VOICE_REPLY_CONFIG_KEY;

    // Assert
    strictEqual(key, expected);
  });

  for (const value of ON_VALUES) {
    it(`is on for ${JSON.stringify(value)}: 'on' alone, in any case and spacing`, () => {
      // Arrange
      const setting = value;

      // Act
      const on = voiceReplyOn(setting);

      // Assert
      strictEqual(on, true, value);
    });
  }

  for (const value of OFF_VALUES) {
    it(`is off for ${JSON.stringify(value) ?? "undefined"}`, () => {
      // Arrange
      const setting = value;

      // Act
      const on = voiceReplyOn(setting);

      // Assert
      strictEqual(on, false, String(value));
    });
  }

  it("names the speech server's tool speak", () => {
    // Arrange
    const expected = "speak";

    // Act
    const tool = SPEAK_TOOL;

    // Assert
    strictEqual(tool, expected);
  });

  it("reads the answer aloud with speak, under its registered name", () => {
    // Arrange
    const registered = "Speak";

    // Act
    const epilogue = voiceReplyEpilogue(registered);

    // Assert
    deepStrictEqual(epilogue, { tool: "Speak", args: {}, textArg: "text", label: "Reply read aloud" });
  });

  it("hands the answer to speak as its text argument", () => {
    // Arrange
    const epilogue = voiceReplyEpilogue("Speak");

    // Act
    const args = epilogueArgs(epilogue, "Paris.");

    // Assert
    deepStrictEqual(args, { text: "Paris." });
  });
});
