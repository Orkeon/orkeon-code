// The messages the harness stores with a marker, told from the requests the user typed, and the request still
// waiting for its answer at the end of a buffer. Run:
//   node --test tests/shared/domain/marked-message.test.ts
import { describe, it } from "node:test";
import { strictEqual } from "node:assert";

import { isMarkedMessage, pendingRequestLength } from "../../../src/shared/domain/marked-message.ts";
import { MARKED_CASES, PENDING_CASES } from "./marked-message.fixtures.ts";

describe("isMarkedMessage", () => {
  for (const c of MARKED_CASES) {
    it(c.name, () => {
      // Arrange
      const content = c.content;

      // Act
      const marked = isMarkedMessage(content);

      // Assert
      strictEqual(marked, c.marked);
    });
  }
});

describe("pendingRequestLength", () => {
  for (const c of PENDING_CASES) {
    it(c.name, () => {
      // Arrange
      const messages = c.messages;

      // Act
      const length = pendingRequestLength(messages);

      // Assert
      strictEqual(length, c.length);
    });
  }
});
