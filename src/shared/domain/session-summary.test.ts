// The /summary request. Run: node --test src/shared/domain/session-summary.test.ts
import { describe, it } from "node:test";

import { SUMMARY_PROMPT } from "./session-summary.ts";
import { assertMentions } from "./session-summary.assertions.ts";

describe("SUMMARY_PROMPT", () => {
  it("leads with where things stand, then fixed headings, bounded", () => {
    // Arrange
    const parts = ["Start with where things stand", "decisions taken", "files touched", "still open", "a few short bullets"];

    // Act
    const prompt = SUMMARY_PROMPT;

    // Assert
    assertMentions(prompt, parts);
  });

  it("says why no tool is needed and covers the compacted turns", () => {
    // Arrange
    const parts = ["calling a tool would only spend this turn", "[compacted]"];

    // Act
    const prompt = SUMMARY_PROMPT;

    // Assert
    assertMentions(prompt, parts);
  });

  it("follows the conversation's language and reports checks as last seen", () => {
    // Arrange
    const parts = ["language of the conversation", "only as it was last seen"];

    // Act
    const prompt = SUMMARY_PROMPT;

    // Assert
    assertMentions(prompt, parts);
  });
});
