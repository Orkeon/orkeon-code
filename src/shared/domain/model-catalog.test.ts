// The declared model catalogue (/model list, /model <name>). Run:
//   node --test src/shared/domain/model-catalog.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual, ok } from "node:assert";

import {
  normalizeModelList, isDeclaredModel, judgeModelChoice, renderModelList,
  NO_CATALOGUE_NOTE, NO_DECLARED_MODELS,
} from "./model-catalog.ts";

describe("normalizeModelList", () => {
  it("keeps the declared order — it is the order an operator chose", () => {
    deepStrictEqual(normalizeModelList(["zeta", "alpha"]), ["zeta", "alpha"]);
  });

  it("drops blanks and collapses case-insensitive duplicates", () => {
    deepStrictEqual(normalizeModelList([" a ", "", "  ", "A", "b"]), ["a", "b"]);
  });

  it("returns [] for anything that is not an array", () => {
    for (const junk of [undefined, null, "a,b", 42, {}]) {
      deepStrictEqual(normalizeModelList(junk), [], String(junk));
    }
  });

  it("coerces non-string entries rather than crashing on them", () => {
    // The value crosses a JSON boundary from C#; a malformed entry must not take
    // /model down, it must just not appear as a usable name.
    deepStrictEqual(normalizeModelList(["ok", null, undefined, 7]), ["ok", "7"]);
  });
});

describe("isDeclaredModel", () => {
  it("matches case-insensitively, like the provider APIs", () => {
    ok(isDeclaredModel(["DeepSeek-V4-Flash"], "deepseek-v4-flash"));
  });

  it("ignores surrounding whitespace", () => {
    ok(isDeclaredModel(["a"], "  a  "));
  });

  it("is false for an empty name and for an empty list", () => {
    strictEqual(isDeclaredModel(["a"], ""), false);
    strictEqual(isDeclaredModel(NO_DECLARED_MODELS, "a"), false);
  });
});

describe("judgeModelChoice — warn, never refuse", () => {
  it("always accepts, even outside the declared list", () => {
    // The list is a hand-written settings hint and can lag the provider's catalogue.
    // Refusing on it would block a model that works — a worse failure than the one
    // being prevented, and silent for a different reason.
    strictEqual(judgeModelChoice(["a"], "b").accepted, true);
  });

  it("warns, naming the declared models, when the name is outside the list", () => {
    const v = judgeModelChoice(["a", "b"], "c");
    ok(v.warning.includes("'c'"));
    ok(v.warning.includes("a, b"));
    ok(v.warning.includes("Llm:AvailableModels"), v.warning);
  });

  it("says the failure mode, so the warning is actionable", () => {
    ok(judgeModelChoice(["a"], "c").warning.includes("next turn fails"));
  });

  it("stays silent for a declared model", () => {
    strictEqual(judgeModelChoice(["a", "b"], "B").warning, "");
  });

  it("stays silent when NOTHING is declared", () => {
    // We know nothing then; a doubt raised on every /model would train the operator
    // to ignore the message, which costs the real warning its effect.
    strictEqual(judgeModelChoice(NO_DECLARED_MODELS, "anything").warning, "");
  });
});

describe("renderModelList", () => {
  it("marks the effective model and leaves the others aligned", () => {
    strictEqual(renderModelList(["a", "b"], "b"), "    a\n  * b");
  });

  it("marks case-insensitively", () => {
    ok(renderModelList(["DeepSeek-V4"], "deepseek-v4").startsWith("  * "));
  });

  it("marks nothing when the effective model is outside the list", () => {
    strictEqual(renderModelList(["a"], "z").includes("*"), false);
  });

  it("returns '' when nothing is declared, so the caller explains why", () => {
    strictEqual(renderModelList(NO_DECLARED_MODELS, "a"), "");
  });
});

describe("NO_CATALOGUE_NOTE", () => {
  it("gives both ways to declare the list", () => {
    ok(NO_CATALOGUE_NOTE.includes("AvailableModels"));
    ok(NO_CATALOGUE_NOTE.includes("Llm__AvailableModels"), NO_CATALOGUE_NOTE);
  });
});
