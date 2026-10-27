// The chain-depth refusal of runCrewAsync from a completed (V-A5). Run:
//   node --test tests/shared/domain/agents/chain.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { chainDepthLine, chainDepthRefusal } from "../../../../src/shared/domain/agents/chain.ts";
import { CHAIN_REFUSALS, OTHER_FAILURES } from "./chain.fixtures.ts";

describe("chainDepthRefusal", () => {
  for (const c of CHAIN_REFUSALS) {
    it(`reads the depth and the limit from the runtime's message, as ${c.name}`, () => {
      // Arrange
      const { failure } = c;

      // Act
      const refusal = chainDepthRefusal(failure);

      // Assert
      deepStrictEqual(refusal, c.refusal);
    });
  }

  for (const c of OTHER_FAILURES) {
    it(`is null for any other failure: ${c.name}`, () => {
      // Arrange
      const { failure } = c;

      // Act
      const refusal = chainDepthRefusal(failure);

      // Assert
      strictEqual(refusal, null);
    });
  }

  it("says what to do, with the depth and the limit the refusal gave", () => {
    // Arrange
    const refusal = { depth: 9, limit: 8 };

    // Act
    const line = chainDepthLine("dev-verify", refusal);

    // Assert
    ok(line.startsWith("dev-verify not launched: the chain of crews reached"), line);
    ok(line.includes("depth 9, limit 8") && line.includes("MaxChainDepth"));
  });

  it("names the command the refusal names", () => {
    // Arrange
    const refusal = { depth: 8, limit: 8, command: "dev-batches" };

    // Act
    const line = chainDepthLine("dev-implement", refusal);

    // Assert
    ok(line.startsWith("dev-implement not launched: the chain of crews of /dev-batches reached"), line);
  });
});
