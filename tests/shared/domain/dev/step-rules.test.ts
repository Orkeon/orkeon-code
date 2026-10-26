// The rule sets each dev step holds, a role's rules on the pack's roots, and what a step says
// when the host's gate is off. Run:
//   node --test src/shared/domain/dev/step-rules.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { DEV_STEPS, gateProblem, roleRules, STEP_ALLOW_RULES, STEP_RULE_SETS, stepRules } from "../../../../src/shared/domain/dev/step-rules.ts";
import { formatRule, ruleDecision } from "../../../../src/shared/domain/agent-policy/permission.ts";
import { RULE_SET_IDS, rulesOf } from "../../../../src/shared/domain/agent-policy/rule-sets.ts";
import {
  BESIDE_LAYOUT, DEV_PLAN_GATE_OFF, EDITORS, FULL_LAYOUT, PILOT_FIRST_RULES, PILOT_LAYOUT, PILOT_READ_TOOLS, REWRITE_LAYOUT,
  REWRITE_RULES, SOURCE_FILE, TEST_FILE,
} from "./step-rules.fixtures.ts";
import { assertDecisions, assertFramedBy } from "./step-rules.assertions.ts";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";

describe("STEP_RULE_SETS", () => {
  it("gives every dev step its sets", () => {
    // Arrange
    const expected = [...DEV_STEPS].sort();

    // Act
    const steps = Object.keys(STEP_RULE_SETS).sort();

    // Assert
    deepStrictEqual(steps, expected);
  });

  for (const step of DEV_STEPS) {
    it(`gives ${step} all five sets today`, () => {
      // Arrange
      const expected = RULE_SET_IDS;

      // Act
      const sets = STEP_RULE_SETS[step];

      // Assert
      deepStrictEqual(sets, expected);
    });
  }

  it("gives /dev-plan the 534 rules of the five sets", () => {
    // Arrange
    const expected = rulesOf(RULE_SET_IDS);

    // Act
    const rules = stepRules("dev-plan");

    // Assert
    deepStrictEqual(rules, expected);
    strictEqual(rules.length, 534);
  });

  it("gives /dev-verify the 534 rules of the five sets", () => {
    // Arrange
    const step = "dev-verify";

    // Act
    const rules = stepRules(step);

    // Assert
    strictEqual(rules.length, 534);
  });

  it("lets /dev-implement's roles run their two tools without a question, after the same deny rules", () => {
    // Arrange
    const denyRules = rulesOf(RULE_SET_IDS);

    // Act
    const rules = stepRules("dev-implement");

    // Assert
    strictEqual(rules.length, 536);
    deepStrictEqual(rules.slice(0, 534), denyRules);
    deepStrictEqual(rules.slice(534).map(formatRule), ["allow run_tests", "allow run_build"]);
    strictEqual(ruleDecision(rules, "run_tests", { command: "npm test" }), "allow");
    strictEqual(ruleDecision(rules, "shell_command", { command: "git push" }), "deny");
  });

  for (const step of ["dev-plan", "dev-verify"] as const) {
    it(`gives ${step} no allow rule`, () => {
      // Arrange
      const expected: [] = [];

      // Act
      const allow = STEP_ALLOW_RULES[step];

      // Assert
      deepStrictEqual(allow, expected);
    });
  }
});

describe("gateProblem", () => {
  for (const enabled of [true, undefined]) {
    it(`says nothing when the gate is on or the host keeps no session rules: ${String(enabled)}`, () => {
      // Arrange
      const gate = enabled;

      // Act
      const problem = gateProblem(gate, "dev-plan");

      // Assert
      strictEqual(problem, null);
    });
  }

  it("refuses when the gate is off", () => {
    // Arrange
    const gate = false;

    // Act
    const problem = gateProblem(gate, "dev-plan");

    // Assert
    deepStrictEqual(problem, { refuse: true, line: DEV_PLAN_GATE_OFF });
  });

  it("names --gate-only in the refusal of /dev-verify", () => {
    // Arrange
    const gate = false;

    // Act
    const line = gateProblem(gate, "dev-verify")?.line ?? "";

    // Assert
    assertFramedBy(line, "dev-verify: refused: ", " /dev-verify F<n> --gate-only runs no model and needs no gate.");
  });
});

describe("roleRules", () => {
  it("keeps the pilot out of the source and test roots the pack gives, and names the missing keys", () => {
    // Arrange
    const layout = PILOT_LAYOUT;

    // Act
    const pilot = roleRules("pilot", layout);

    // Assert
    deepStrictEqual(pilot.rules.map(formatRule).slice(0, 4), PILOT_FIRST_RULES);
    strictEqual(pilot.rules.length, 2 * (16 + 8) + 2);
    deepStrictEqual(pilot.rules.slice(-2).map(formatRule), ["deny structural_search", "deny symbol_source"]);
    deepStrictEqual(pilot.missing, ["layout.application", "layout.infrastructure"]);
    assertDecisions(pilot.rules, PILOT_READ_TOOLS, { path: "tests/a.test.ts" }, "deny");
    strictEqual(ruleDecision(pilot.rules, "file_write", { path: "tests/a.test.ts" }), undefined);
  });

  it("lets the test author write tests only", () => {
    // Arrange
    const layout = FULL_LAYOUT;

    // Act
    const author = roleRules("test-author", layout).rules;

    // Assert
    strictEqual(ruleDecision(author, "file_write", TEST_FILE), undefined);
    strictEqual(ruleDecision(author, "file_write", SOURCE_FILE), "deny");
    assertDecisions(author, EDITORS, SOURCE_FILE, "deny");
    assertDecisions(author, EDITORS, TEST_FILE, undefined);
    deepStrictEqual(author.slice(-1).map(formatRule), ["deny structural_rewrite"]);
    strictEqual(ruleDecision(author, "edit_batch", { operations: [] }), undefined);
    strictEqual(author.length, 3 * 10 + 1);
  });

  it("lets the implementer write sources only", () => {
    // Arrange
    const layout = FULL_LAYOUT;

    // Act
    const implementer = roleRules("implementer", layout).rules;

    // Assert
    strictEqual(ruleDecision(implementer, "file_write", TEST_FILE), "deny");
    strictEqual(ruleDecision(implementer, "file_write", SOURCE_FILE), undefined);
    assertDecisions(implementer, EDITORS, TEST_FILE, "deny");
    deepStrictEqual(implementer.slice(-1).map(formatRule), ["deny structural_rewrite"]);
    strictEqual(ruleDecision(implementer, "edit_batch", { operations: [] }), undefined);
    strictEqual(implementer.length, 10 + 1);
  });

  it("leaves the test files beside the code to the test author", () => {
    // Arrange
    const layout = BESIDE_LAYOUT;

    // Act
    const author = roleRules("test-author", layout);

    // Assert
    deepStrictEqual(author.writable, ["src/*.test.ts"]);
  });

  it("keeps the implementer off the test files beside the code", () => {
    // Arrange
    const layout = BESIDE_LAYOUT;

    // Act
    const implementer = roleRules("implementer", layout);

    // Assert
    deepStrictEqual(implementer.missing, []);
    strictEqual(ruleDecision(implementer.rules, "file_write", { path: `${WORKSPACE}/src/a/x.test.ts` }), "deny");
    strictEqual(ruleDecision(implementer.rules, "file_write", { path: "src/a/x.ts" }), undefined);
    deepStrictEqual(implementer.rules.slice(-1).map(formatRule), ["deny structural_rewrite"]);
  });

  it("reports a test pattern out of the checkout", () => {
    // Arrange
    const layout = { testFiles: ["/etc/*", "../x/*"] };

    // Act
    const implementer = roleRules("implementer", layout);

    // Assert
    deepStrictEqual(implementer.problems.length, 2);
  });

  for (const role of ["test-author", "implementer"] as const) {
    it(`gives each writing role the rewrite rule: no file_write on any source root or test pattern, the other editors free: ${role}`, () => {
      // Arrange
      const layout = REWRITE_LAYOUT;

      // Act
      const { rewrite } = roleRules(role, layout);

      // Assert
      deepStrictEqual(rewrite.map(formatRule), REWRITE_RULES, role);
      assertDecisions(rewrite, EDITORS, { path: "src/d/x.ts" }, undefined);
      strictEqual(ruleDecision(rewrite, "file_write", { path: "docs/x.md" }), undefined);
    });
  }

  it("gives the pilot no rewrite rule", () => {
    // Arrange
    const layout = REWRITE_LAYOUT;

    // Act
    const { rewrite } = roleRules("pilot", layout);

    // Assert
    deepStrictEqual(rewrite, []);
  });
});
