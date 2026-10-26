// The guard chain of Orkeon Code's own tools: order, first refusal, a throwing guard
// refuses; the rule guard reads the rules as the gate does; arguments and tails. Run:
//   node --test src/shared/domain/dev/tool-guards.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { outputTail, runGuards, shellRuleGuard, stringArgument } from "../../../../src/shared/domain/dev/tool-guards.ts";
import { rulesOf } from "../../../../src/shared/domain/agent-policy/rule-sets.ts";
import {
  ARGUMENT_CASES, boom, INLINE_FORMS, READONLY_AND_INTERPRETERS, recordingGuards, RULE_CASES, TWENTY_LINES,
} from "./tool-guards.fixtures.ts";

describe("runGuards", () => {
  it("passes when every guard passes, each called in order", () => {
    // Arrange
    const { seen, pass } = recordingGuards();

    // Act
    const refusal = runGuards([pass("a"), pass("b")], "x");

    // Assert
    strictEqual(refusal, null);
    deepStrictEqual(seen, ["a", "b"]);
  });

  it("stops at the first refusal", () => {
    // Arrange
    const { seen, pass, refuse } = recordingGuards();

    // Act
    const refusal = runGuards([pass("a"), refuse("b"), refuse("c")], "x");

    // Assert
    strictEqual(refusal, "b refuses");
    deepStrictEqual(seen, ["a", "b"]);
  });

  it("refuses when a guard throws", () => {
    // Arrange
    const guards = [boom];

    // Act
    const refusal = runGuards(guards, "x");

    // Assert
    strictEqual(refusal, "a guard failed: bad pattern");
  });
});

describe("shellRuleGuard", () => {
  for (const c of RULE_CASES) {
    it(`refuses a command a deny rule of the step covers, and lets the others through: ${c.name}`, () => {
      // Arrange
      const guard = shellRuleGuard(rulesOf(c.sets));

      // Act
      const refusal = guard(c.command);

      // Assert
      strictEqual(refusal, c.expected);
    });
  }

  it("refuses the command in the form the program receives it: quotes gone", () => {
    // Arrange
    const guard = shellRuleGuard(rulesOf(READONLY_AND_INTERPRETERS));

    // Act
    const refusal = guard('git "push" origin');

    // Assert
    strictEqual(refusal, "the rules of this step deny the shell command 'git \"push\" origin'");
  });

  for (const command of INLINE_FORMS) {
    it(`refuses the command in the form the program receives it: ${command}`, () => {
      // Arrange
      const guard = shellRuleGuard(rulesOf(READONLY_AND_INTERPRETERS));

      // Act
      const refusal = guard(command);

      // Assert
      ok(refusal !== null, command);
    });
  }

  it("lets a plain command through under the same rules", () => {
    // Arrange
    const guard = shellRuleGuard(rulesOf(READONLY_AND_INTERPRETERS));

    // Act
    const refusal = guard("ls -la");

    // Assert
    strictEqual(refusal, null);
  });

  it("does not refuse what an allow rule alone covers", () => {
    // Arrange
    const guard = shellRuleGuard([{ effect: "allow", tool: "shell_command" }]);

    // Act
    const refusal = guard("npm test");

    // Assert
    strictEqual(refusal, null);
  });
});

describe("stringArgument", () => {
  for (const c of ARGUMENT_CASES) {
    it(`reads one line of at most 400 characters, trimmed: ${c.name}`, () => {
      // Arrange
      const { input, key, required } = c;

      // Act
      const result = stringArgument(input, key, required);

      // Assert
      deepStrictEqual(result, c.expected);
    });
  }
});

describe("outputTail", () => {
  it("keeps the last 15 lines, stderr after stdout", () => {
    // Arrange
    const out = TWENTY_LINES;

    // Act
    const tail = outputTail(out, "boom\n");

    // Assert
    strictEqual(tail.split("\n").length, 15);
    strictEqual(tail.split("\n").at(-1), "boom");
  });

  it("keeps at most 1 500 characters", () => {
    // Arrange
    const out = "x".repeat(3_000);

    // Act
    const tail = outputTail(out, "");

    // Assert
    strictEqual(tail.length, 1_500);
  });

  it("is empty for no output", () => {
    // Arrange
    const out = "";

    // Act
    const tail = outputTail(out, "");

    // Assert
    strictEqual(tail, "");
  });
});
