// Unit tests for the strip-chain. Run:
//   node --test tests/shared/domain/strip.test.ts
import { describe, it } from "node:test";
import { strictEqual, ok } from "node:assert";

import {
  unwrapFences,
  stripThinking,
  stripPreamble,
  stripLeakedScratch,
  cleanLlmMarkdown,
} from "../../../src/shared/domain/strip.ts";
import {
  FENCE_IN_FENCE, FULL_CHAIN_RAW, STRIP_LEAKED_SCRATCH_CASES, STRIP_PREAMBLE_CASES, STRIP_THINKING_CASES,
  UNWRAP_FENCES_CASES,
} from "./strip.fixtures.ts";

describe("unwrapFences", () => {
  for (const c of UNWRAP_FENCES_CASES) {
    it(c.name, () => {
      // Arrange
      const { raw } = c;

      // Act
      const cleaned = unwrapFences(raw);

      // Assert
      strictEqual(cleaned, c.cleaned);
    });
  }

  it("preserves inner fenced blocks (only outermost wrap removed)", () => {
    // Arrange
    const inp = FENCE_IN_FENCE;

    // Act
    const cleaned = unwrapFences(inp);

    // Assert
    ok(cleaned.includes("```js"), cleaned);
  });
});

describe("stripThinking", () => {
  for (const c of STRIP_THINKING_CASES) {
    it(c.name, () => {
      // Arrange
      const { raw } = c;

      // Act
      const cleaned = stripThinking(raw);

      // Assert
      strictEqual(cleaned, c.cleaned);
    });
  }
});

describe("stripPreamble", () => {
  for (const c of STRIP_PREAMBLE_CASES) {
    it(c.name, () => {
      // Arrange
      const { raw } = c;

      // Act
      const cleaned = stripPreamble(raw);

      // Assert
      strictEqual(cleaned, c.cleaned);
    });
  }
});

describe("stripLeakedScratch", () => {
  for (const c of STRIP_LEAKED_SCRATCH_CASES) {
    it(c.name, () => {
      // Arrange
      const { raw } = c;

      // Act
      const cleaned = stripLeakedScratch(raw);

      // Assert
      strictEqual(cleaned, c.cleaned);
    });
  }
});

describe("cleanLlmMarkdown (full chain)", () => {
  it("composes thinking + preamble + fence stripping", () => {
    // Arrange
    const raw = FULL_CHAIN_RAW;

    // Act
    const cleaned = cleanLlmMarkdown(raw);

    // Assert
    strictEqual(cleaned, "# Title\nbody");
  });

  it("is idempotent", () => {
    // Arrange
    const once = cleanLlmMarkdown("Preamble\n# T\nx");

    // Act
    const twice = cleanLlmMarkdown(once);

    // Assert
    strictEqual(twice, once);
  });
});
