// Run: node --test tests/shared/domain/agent-policy/rule-sets.test.ts
import { describe, it } from "node:test";
import { strictEqual, ok, deepStrictEqual } from "node:assert";

import {
  catalogueFor, checkRule, coversEveryCall, formatRule, gateLine, readRule, ruleDecision, sameCalls, TOOL_ARGUMENTS,
  toolsetFor,
} from "../../../../src/shared/domain/agent-policy/permission.ts";
import {
  heldRuleSets, PATH_READ_TOOLS, PATH_WRITE_TOOLS, pathRules, RULE_SET_IDS, RULE_SETS, rulesOf, UNSCOPED_WRITE_TOOLS,
  WRITTEN_TEXT,
} from "../../../../src/shared/domain/agent-policy/rule-sets.ts";
import { PERMISSION_MODES } from "../../../../src/shared/domain/permission-modes.ts";
import { REVIEWER_TOOLS } from "../../../../src/shared/domain/dev/reviewer-charter.ts";
import {
  CALL_CASES, GATE_LINE_CASES, GIT_CONFIG_CASES, gitRefused, linesWithReadNoise, READ_ROOT_DECISIONS, READ_ROOT_RULES,
  REFUSAL_CASES, ROOTS_WITHOUT_RULE, ROOTS_WITHOUT_RULE_PROBLEMS, WRITE_ROOT_RULES,
} from "./rule-sets.fixtures.ts";
import { assertEveryDecision, assertRuleable } from "./rule-sets.assertions.ts";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";

describe("the rule sets", () => {
  for (const id of RULE_SET_IDS) {
    it(`reads every rule of ${id} back unchanged`, () => {
      // Arrange
      const { rules } = RULE_SETS[id];

      // Act
      const read = rules.map((r) => readRule(formatRule(r)));

      // Assert
      deepStrictEqual(read, rules, id);
    });

    it(`checks every rule of ${id} as valid`, () => {
      // Arrange
      const { rules } = RULE_SETS[id];

      // Act
      const checked = rules.map((r) => checkRule(formatRule(r)));

      // Assert
      deepStrictEqual(checked, rules.map((rule) => ({ ok: true, rule })), id);
    });

    it(`makes every rule of ${id} a deny on a ruleable tool and an argument it takes`, () => {
      // Arrange
      const { rules } = RULE_SETS[id];

      // Act
      const unscoped = rules.filter(coversEveryCall);

      // Assert
      ok(unscoped.every((r) => UNSCOPED_WRITE_TOOLS.includes(r.tool)), id);
      assertRuleable(rules);
    });
  }

  it("names tools that read one path, each taking the path argument", () => {
    // Arrange
    const tools = PATH_READ_TOOLS;

    // Act
    const without = tools.filter((tool) => !TOOL_ARGUMENTS[tool].includes("path"));

    // Assert
    deepStrictEqual(without, []);
  });

  it("names tools that write one path, each taking the path argument", () => {
    // Arrange
    const tools = PATH_WRITE_TOOLS;

    // Act
    const without = tools.filter((tool) => !TOOL_ARGUMENTS[tool].includes("path"));

    // Assert
    deepStrictEqual(without, []);
  });

  it("names writing tools that take the text argument the secrets set reads", () => {
    // Arrange
    const written = WRITTEN_TEXT;

    // Act
    const without = written.filter(([tool, argument]) => !TOOL_ARGUMENTS[tool].includes(argument));

    // Assert
    deepStrictEqual(without.map(([tool, argument]) => `${tool}.${argument}`), []);
  });

  it("holds 218, 28, 64, 128 and 96 rules", () => {
    // Arrange
    const ids = RULE_SET_IDS;

    // Act
    const sizes = ids.map((id) => RULE_SETS[id].rules.length);

    // Assert
    deepStrictEqual(sizes, [218, 28, 64, 128, 96]);
  });

  it("holds 534 rules in all, none of them on edit_batch", () => {
    // Arrange
    const ids = RULE_SET_IDS;

    // Act
    const all = rulesOf(ids);

    // Assert
    strictEqual(all.length, 534);
    ok(!all.some((r) => r.tool === "edit_batch"));
  });

  it("holds no two rules that cover the same calls", () => {
    // Arrange
    const all = rulesOf(RULE_SET_IDS);

    // Act
    const twins: string[] = [];
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) if (sameCalls(all[i], all[j])) twins.push(gateLine(all[i]));
    }

    // Assert
    deepStrictEqual(twins, []);
  });

  for (const c of GATE_LINE_CASES) {
    it(`keeps the rule ${c.index} of ${c.id} in its place, as ${c.line}`, () => {
      // Arrange
      const rule = RULE_SETS[c.id].rules.at(c.index)!;

      // Act
      const line = gateLine(rule);

      // Assert
      strictEqual(line, c.line);
    });
  }

  it("lists the sets by their own ids, in order", () => {
    // Arrange
    const ids = RULE_SET_IDS;

    // Act
    const own = ids.map((id) => RULE_SETS[id].id);

    // Assert
    deepStrictEqual(own, ids);
  });

  for (const id of RULE_SET_IDS) {
    it(`titles ${id} on one line`, () => {
      // Arrange
      const set = RULE_SETS[id];

      // Act
      const { title } = set;

      // Assert
      ok(title.length > 0 && !title.includes("\n"), id);
    });
  }

  for (const mode of PERMISSION_MODES) {
    it(`removes from the ${mode} catalogue only the writing tools whose paths the gate cannot read`, () => {
      // Arrange
      const rules = rulesOf(RULE_SET_IDS);
      const unscoped = toolsetFor(mode).filter((t) => UNSCOPED_WRITE_TOOLS.includes(t));

      // Act
      const decision = catalogueFor(mode, rules);

      // Assert
      deepStrictEqual(decision.deniedByRule, unscoped, mode);
      deepStrictEqual(decision.tools, toolsetFor(mode).filter((t) => !unscoped.includes(t)), mode);
    });
  }

  it("removes structural_rewrite from the default catalogue", () => {
    // Arrange
    const rules = rulesOf(RULE_SET_IDS);

    // Act
    const { deniedByRule } = catalogueFor("default", rules);

    // Assert
    deepStrictEqual(deniedByRule, ["structural_rewrite"]);
  });

  it("keeps every reviewer tool in the plan catalogue", () => {
    // Arrange
    const rules = rulesOf(RULE_SET_IDS);

    // Act
    const plan = catalogueFor("plan", rules).tools;

    // Assert
    for (const tool of REVIEWER_TOOLS) ok(plan.includes(tool), tool);
  });

  for (const c of REFUSAL_CASES) {
    it(c.name, () => {
      // Arrange
      const { rules } = RULE_SETS[c.id];

      // Act
      const decisions = c.values.map((value) => ruleDecision(rules, c.tool, { [c.argument]: value }) === "deny");

      // Assert
      assertEveryDecision(c.values, decisions, c.refused, c.id);
    });
  }

  for (const c of GIT_CONFIG_CASES) {
    it(c.name, () => {
      // Arrange
      const { commands } = c;

      // Act
      const decisions = commands.map(gitRefused);

      // Assert
      assertEveryDecision(commands, decisions, c.refused, "git-readonly");
    });
  }

  for (const c of CALL_CASES) {
    it(c.name, () => {
      // Arrange
      const { rules } = RULE_SETS[c.id];

      // Act
      const decision = ruleDecision(rules, c.tool, c.args);

      // Assert
      strictEqual(decision === "deny", c.refused, c.tool);
    });
  }

  it("pathRules makes two rules per root and writing tool, then denies the unscoped writers once", () => {
    // Arrange
    const roots = ["./tests/", `${WORKSPACE}/src/shared/domain`, "tests"];

    // Act
    const made = pathRules("write", roots);

    // Assert
    deepStrictEqual(made.rules.map(formatRule), WRITE_ROOT_RULES);
    strictEqual(made.rules.length, 2 * 10 + 1);
    deepStrictEqual(made.problems, []);
    strictEqual(made.rules[0].tool, "file_write");
  });

  it("pathRules makes two rules per root and reading tool, the root itself for the folder readers, then denies structural_search and symbol_source once", () => {
    // Arrange
    const roots = ["tests"];

    // Act
    const made = pathRules("read", roots);

    // Assert
    deepStrictEqual(made.rules.map(formatRule), READ_ROOT_RULES);
    strictEqual(made.rules.length, 16 + 8 + 2);
  });

  for (const c of READ_ROOT_DECISIONS) {
    it(`pathRules on the read root tests ${c.name}`, () => {
      // Arrange
      const { rules } = pathRules("read", ["tests"]);

      // Act
      const decision = ruleDecision(rules, c.tool, c.args);

      // Assert
      strictEqual(decision, c.decision);
    });
  }

  it("pathRules makes no rule on a root outside the project", () => {
    // Arrange
    const roots = ["/etc"];

    // Act
    const { rules } = pathRules("write", roots);

    // Assert
    deepStrictEqual(rules, []);
  });

  it("pathRules says why a root gets none, and adds no whole-tool deny without a kept root", () => {
    // Arrange
    const roots = ROOTS_WITHOUT_RULE;

    // Act
    const none = pathRules("read", roots);

    // Assert
    deepStrictEqual(none.rules, []);
    deepStrictEqual(none.problems, ROOTS_WITHOUT_RULE_PROBLEMS);
  });

  it("heldRuleSets counts the lines of each set and keeps the others", () => {
    // Arrange
    const lines = linesWithReadNoise();

    // Act
    const held = heldRuleSets(lines);

    // Assert
    deepStrictEqual(held, {
      sets: [{ id: "read-noise", count: 64 }],
      rest: ["allow shell_command command=npm test*"],
    });
  });

  it("heldRuleSets finds no set and keeps nothing in no line", () => {
    // Arrange
    const lines: string[] = [];

    // Act
    const held = heldRuleSets(lines);

    // Assert
    deepStrictEqual(held, { sets: [], rest: [] });
  });
});
