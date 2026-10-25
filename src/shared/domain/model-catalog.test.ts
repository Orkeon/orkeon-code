// The declared model catalogue (/model list, /model <name>). Run:
//   node --test src/shared/domain/model-catalog.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual, ok } from "node:assert";

import {
  normalizeModelList, isDeclaredModel, judgeModelChoice, renderModelList,
  NO_CATALOGUE_NOTE, NO_DECLARED_MODELS,
} from "./model-catalog.ts";
import { NOT_LISTS } from "./model-catalog.fixtures.ts";
import { assertMentions } from "./model-catalog.assertions.ts";

describe("normalizeModelList", () => {
  it("keeps the declared order — it is the order an operator chose", () => {
    // Arrange
    const declared = ["zeta", "alpha"];

    // Act
    const list = normalizeModelList(declared);

    // Assert
    deepStrictEqual(list, ["zeta", "alpha"]);
  });

  it("drops blanks and collapses case-insensitive duplicates", () => {
    // Arrange
    const declared = [" a ", "", "  ", "A", "b"];

    // Act
    const list = normalizeModelList(declared);

    // Assert
    deepStrictEqual(list, ["a", "b"]);
  });

  for (const junk of NOT_LISTS) {
    it(`returns [] for anything that is not an array: ${String(junk)}`, () => {
      // Arrange
      const declared = junk;

      // Act
      const list = normalizeModelList(declared);

      // Assert
      deepStrictEqual(list, [], String(junk));
    });
  }

  it("coerces non-string entries rather than crashing on them", () => {
    // The value crosses a JSON boundary from C#; a malformed entry must not take
    // /model down, it must just not appear as a usable name.
    // Arrange
    const declared = ["ok", null, undefined, 7];

    // Act
    const list = normalizeModelList(declared);

    // Assert
    deepStrictEqual(list, ["ok", "7"]);
  });
});

describe("isDeclaredModel", () => {
  it("matches case-insensitively, like the provider APIs", () => {
    // Arrange
    const declared = ["DeepSeek-V4-Flash"];

    // Act
    const known = isDeclaredModel(declared, "deepseek-v4-flash");

    // Assert
    ok(known);
  });

  it("ignores surrounding whitespace", () => {
    // Arrange
    const declared = ["a"];

    // Act
    const known = isDeclaredModel(declared, "  a  ");

    // Assert
    ok(known);
  });

  it("is false for an empty name", () => {
    // Arrange
    const declared = ["a"];

    // Act
    const known = isDeclaredModel(declared, "");

    // Assert
    strictEqual(known, false);
  });

  it("is false for an empty list", () => {
    // Arrange
    const declared = NO_DECLARED_MODELS;

    // Act
    const known = isDeclaredModel(declared, "a");

    // Assert
    strictEqual(known, false);
  });
});

describe("judgeModelChoice — warn, never refuse", () => {
  it("always accepts, even outside the declared list", () => {
    // The list is a hand-written settings hint and can lag the provider's catalogue.
    // Refusing on it would block a model that works — a worse failure than the one
    // being prevented, and silent for a different reason.
    // Arrange
    const declared = ["a"];

    // Act
    const verdict = judgeModelChoice(declared, "b");

    // Assert
    strictEqual(verdict.accepted, true);
  });

  it("warns, naming the declared models, when the name is outside the list", () => {
    // Arrange
    const declared = ["a", "b"];

    // Act
    const v = judgeModelChoice(declared, "c");

    // Assert
    assertMentions(v.warning, ["'c'", "a, b", "Llm:AvailableModels"]);
  });

  it("says the failure mode, so the warning is actionable", () => {
    // Arrange
    const declared = ["a"];

    // Act
    const v = judgeModelChoice(declared, "c");

    // Assert
    assertMentions(v.warning, ["next turn fails"]);
  });

  it("stays silent for a declared model", () => {
    // Arrange
    const declared = ["a", "b"];

    // Act
    const v = judgeModelChoice(declared, "B");

    // Assert
    strictEqual(v.warning, "");
  });

  it("stays silent when NOTHING is declared", () => {
    // We know nothing then; a doubt raised on every /model would train the operator
    // to ignore the message, which costs the real warning its effect.
    // Arrange
    const declared = NO_DECLARED_MODELS;

    // Act
    const v = judgeModelChoice(declared, "anything");

    // Assert
    strictEqual(v.warning, "");
  });
});

describe("renderModelList", () => {
  it("marks the effective model and leaves the others aligned", () => {
    // Arrange
    const declared = ["a", "b"];

    // Act
    const text = renderModelList(declared, "b");

    // Assert
    strictEqual(text, "    a\n  * b");
  });

  it("marks case-insensitively", () => {
    // Arrange
    const declared = ["DeepSeek-V4"];

    // Act
    const text = renderModelList(declared, "deepseek-v4");

    // Assert
    ok(text.startsWith("  * "), text);
  });

  it("marks nothing when the effective model is outside the list", () => {
    // Arrange
    const declared = ["a"];

    // Act
    const text = renderModelList(declared, "z");

    // Assert
    strictEqual(text.includes("*"), false);
  });

  it("returns '' when nothing is declared, so the caller explains why", () => {
    // Arrange
    const declared = NO_DECLARED_MODELS;

    // Act
    const text = renderModelList(declared, "a");

    // Assert
    strictEqual(text, "");
  });
});

describe("NO_CATALOGUE_NOTE", () => {
  it("gives both ways to declare the list", () => {
    // Arrange
    const ways = ["AvailableModels", "Llm__AvailableModels"];

    // Act
    const note = NO_CATALOGUE_NOTE;

    // Assert
    assertMentions(note, ways);
  });
});
