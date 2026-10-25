// The rule sets each dev step holds, a role's rules on the pack's roots, and what a step says
// when the host's gate is off. Run:
//   node --test src/shared/domain/dev/step-rules.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { DEV_STEPS, gateProblem, roleRules, STEP_ALLOW_RULES, STEP_RULE_SETS, stepRules } from "./step-rules.ts";
import { formatRule, ruleDecision } from "../agent-policy/permission.ts";
import { RULE_SET_IDS, rulesOf } from "../agent-policy/rule-sets.ts";

describe("STEP_RULE_SETS", () => {
  it("gives every dev step its sets, all five today", () => {
    deepStrictEqual(Object.keys(STEP_RULE_SETS).sort(), [...DEV_STEPS].sort());
    for (const step of DEV_STEPS) deepStrictEqual(STEP_RULE_SETS[step], RULE_SET_IDS);
    deepStrictEqual(stepRules("dev-plan"), rulesOf(RULE_SET_IDS));
    strictEqual(stepRules("dev-plan").length, 534);
    strictEqual(stepRules("dev-verify").length, 534);
  });

  it("lets /dev-implement's roles run their two tools without a question, after the same deny rules", () => {
    const rules = stepRules("dev-implement");
    strictEqual(rules.length, 536);
    deepStrictEqual(rules.slice(0, 534), rulesOf(RULE_SET_IDS));
    deepStrictEqual(rules.slice(534).map(formatRule), ["allow run_tests", "allow run_build"]);
    deepStrictEqual(STEP_ALLOW_RULES["dev-plan"], []);
    deepStrictEqual(STEP_ALLOW_RULES["dev-verify"], []);
    strictEqual(ruleDecision(rules, "run_tests", { command: "npm test" }), "allow");
    strictEqual(ruleDecision(rules, "shell_command", { command: "git push" }), "deny");
  });
});

describe("gateProblem", () => {
  it("says nothing when the gate is on or the host keeps no session rules, refuses when it is off", () => {
    strictEqual(gateProblem(true, "dev-plan"), null);
    strictEqual(gateProblem(undefined, "dev-plan"), null);
    deepStrictEqual(gateProblem(false, "dev-plan"), {
      refuse: true,
      line: "dev-plan: refused: the host's permission gate is off (Orkeon:Security:PermissionGate:Enabled is not true), " +
        "so the step's rule sets and its read-only mode would check nothing. The launcher turns the gate on unless a " +
        "settings file turns it off: remove that setting, restart the REPL and run /dev-plan again.",
    });
  });

  it("names --gate-only in the refusal of /dev-verify", () => {
    const line = gateProblem(false, "dev-verify")?.line ?? "";
    ok(line.endsWith(" /dev-verify F<n> --gate-only runs no model and needs no gate."), line);
    ok(line.startsWith("dev-verify: refused: "), line);
  });
});

describe("roleRules", () => {
  it("keeps the pilot out of the source and test roots the pack gives, and names the missing keys", () => {
    const pilot = roleRules("pilot", { domain: "src/core/Orkeon.Domain", tests: "tests" });
    deepStrictEqual(pilot.rules.map(formatRule).slice(0, 4), [
      "deny file_read path=/workspace/src/core/Orkeon.Domain/*",
      "deny file_read path=src/core/Orkeon.Domain/*",
      "deny glob path=/workspace/src/core/Orkeon.Domain/*",
      "deny glob path=src/core/Orkeon.Domain/*",
    ]);
    strictEqual(pilot.rules.length, 2 * (16 + 8) + 2);
    deepStrictEqual(pilot.rules.slice(-2).map(formatRule), ["deny structural_search", "deny symbol_source"]);
    deepStrictEqual(pilot.missing, ["layout.application", "layout.infrastructure"]);
    for (const tool of ["file_read", "grep", "node_outline", "documents_of", "directory_search"]) {
      strictEqual(ruleDecision(pilot.rules, tool, { path: "tests/a.test.ts" }), "deny", tool);
    }
    strictEqual(ruleDecision(pilot.rules, "file_write", { path: "tests/a.test.ts" }), undefined);
  });

  it("lets the test author write tests only, and the implementer write sources only", () => {
    const layout = { domain: "src/d", application: "src/a", infrastructure: "src/i", tests: "tests" };
    const author = roleRules("test-author", layout).rules;
    const implementer = roleRules("implementer", layout).rules;
    const test = { path: "/workspace/tests/a.test.ts" };
    const source = { path: "/workspace/src/d/x.ts" };
    strictEqual(ruleDecision(author, "file_write", test), undefined);
    strictEqual(ruleDecision(implementer, "file_write", test), "deny");
    strictEqual(ruleDecision(author, "file_write", source), "deny");
    strictEqual(ruleDecision(implementer, "file_write", source), undefined);
    for (const tool of ["edit_file", "node_replace", "node_insert", "node_ensure"]) {
      strictEqual(ruleDecision(implementer, tool, test), "deny", tool);
      strictEqual(ruleDecision(author, tool, source), "deny", tool);
      strictEqual(ruleDecision(author, tool, test), undefined, tool);
    }
    for (const rules of [author, implementer]) {
      deepStrictEqual(rules.slice(-1).map(formatRule), ["deny structural_rewrite"]);
      strictEqual(ruleDecision(rules, "edit_batch", { operations: [] }), undefined);
    }
    strictEqual(author.length, 3 * 10 + 1);
    strictEqual(implementer.length, 10 + 1);
  });

  it("keeps the implementer off the test files beside the code, and leaves them to the test author", () => {
    const layout = { domain: "src", testFiles: ["src/*.test.ts"] };
    const author = roleRules("test-author", layout);
    const implementer = roleRules("implementer", layout);
    deepStrictEqual(author.writable, ["src/*.test.ts"]);
    deepStrictEqual(implementer.missing, []);
    strictEqual(ruleDecision(implementer.rules, "file_write", { path: "/workspace/src/a/x.test.ts" }), "deny");
    strictEqual(ruleDecision(implementer.rules, "file_write", { path: "src/a/x.ts" }), undefined);
    deepStrictEqual(implementer.rules.slice(-1).map(formatRule), ["deny structural_rewrite"]);
    deepStrictEqual(roleRules("implementer", { testFiles: ["/etc/*", "../x/*"] }).problems.length, 2);
  });

  it("gives each writing role the rewrite rule: no file_write on any source root or test pattern, the other editors free", () => {
    const layout = { domain: "src/d", application: "src/a", infrastructure: "", tests: "./tests/", testFiles: ["src/*.test.ts", "../x/*"] };
    for (const role of ["test-author", "implementer"] as const) {
      const { rewrite } = roleRules(role, layout);
      deepStrictEqual(rewrite.map(formatRule), [
        "deny file_write path=/workspace/src/d/*", "deny file_write path=src/d/*",
        "deny file_write path=/workspace/src/a/*", "deny file_write path=src/a/*",
        "deny file_write path=/workspace/tests/*", "deny file_write path=tests/*",
        "deny file_write path=/workspace/src/*.test.ts", "deny file_write path=src/*.test.ts",
      ], role);
      for (const tool of ["edit_file", "node_replace", "node_insert", "node_ensure"]) {
        strictEqual(ruleDecision(rewrite, tool, { path: "src/d/x.ts" }), undefined, tool);
      }
      strictEqual(ruleDecision(rewrite, "file_write", { path: "docs/x.md" }), undefined);
    }
    deepStrictEqual(roleRules("pilot", layout).rewrite, []);
  });
});
