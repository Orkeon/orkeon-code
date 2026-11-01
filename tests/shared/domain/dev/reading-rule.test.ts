// The shared reading rules of the dev agents. Run:
//   node --test tests/shared/domain/dev/reading-rule.test.ts
import { describe, it } from "node:test";

import { BOUNDED_READ_RULE, NODE_READ_RULE } from "../../../../src/shared/domain/dev/reading-rule.ts";
import { NODE_READ_MENTIONS, PARALLEL_READS_MENTIONS, WHOLE_FILE_BAN } from "./reading-rule.fixtures.ts";
import { assertMentions, assertOmits } from "../../../support/assertions/text.ts";

describe("BOUNDED_READ_RULE", () => {
  it("asks for the reads known at once in one turn, since the runtime runs them together", () => {
    // Arrange
    const parts = PARALLEL_READS_MENTIONS;

    // Act
    const text = BOUNDED_READ_RULE;

    // Assert
    assertMentions(text, parts);
  });

  it("forbids reading a whole file for its own sake", () => {
    // Arrange
    const ban = WHOLE_FILE_BAN;

    // Act
    const text = BOUNDED_READ_RULE;

    // Assert
    assertMentions(text, [ban]);
  });
});

describe("NODE_READ_RULE", () => {
  it("reads by node and names the sha256 node_read gives", () => {
    // Arrange
    const parts = NODE_READ_MENTIONS;

    // Act
    const text = NODE_READ_RULE;

    // Assert
    assertMentions(text, parts);
  });

  it("leaves the whole-file ban to the bounded reading rule", () => {
    // Arrange
    const banned = ["whole"];

    // Act
    const text = NODE_READ_RULE;

    // Assert
    assertOmits(text, banned);
  });
});
