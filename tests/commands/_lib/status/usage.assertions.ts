// The checks of the /usage tests made of more than one native assertion.
import { deepStrictEqual } from "node:assert";
import type { InOut } from "./usage.fixtures.ts";

/** The row's tokens sent, received and spent reasoning are `expected`. */
export function assertInOut(row: object | undefined, expected: InOut): void {
  const { llmInTokens, llmOutTokens, llmReasoningTokens } = (row ?? {}) as Partial<InOut>;
  deepStrictEqual({ llmInTokens, llmOutTokens, llmReasoningTokens }, expected, "the tokens sent, received and spent reasoning");
}
