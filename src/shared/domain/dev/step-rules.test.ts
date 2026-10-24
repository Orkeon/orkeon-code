// The rule sets each dev step holds, a role's rules on the pack's roots, and what a step says
// when the host's gate is off. Run:
//   node --test src/shared/domain/dev/step-rules.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { DEV_STEPS, gateProblem, roleRules, STEP_RULE_SETS, stepRules } from "./step-rules.ts";
import { formatRule, ruleDecision } from "../agent-policy/permission.ts";
import { RULE_SET_IDS, rulesOf } from "../agent-policy/rule-sets.ts";

describe("STEP_RULE_SETS", () => {
  it("gives every dev step its sets, all five today", () => {
    deepStrictEqual(Object.keys(STEP_RULE_SETS).sort(), [...DEV_STEPS].sort());
    for (const step of DEV_STEPS) deepStrictEqual(STEP_RULE_SETS[step], RULE_SET_IDS);
    deepStrictEqual(stepRules("dev-plan"), rulesOf(RULE_SET_IDS));
    strictEqual(stepRules("dev-plan").length, 407);
    strictEqual(stepRules("dev-verify").length, 407);
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
    strictEqual(pilot.rules.length, 2 * (14 + 6) + 1);
    strictEqual(formatRule(pilot.rules[pilot.rules.length - 1]), "deny structural_search");
    deepStrictEqual(pilot.missing, ["layout.application", "layout.infrastructure"]);
    for (const tool of ["file_read", "grep", "node_outline", "documents_of"]) {
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
      deepStrictEqual(rules.slice(-2).map(formatRule), ["deny edit_batch", "deny structural_rewrite"]);
    }
    strictEqual(author.length, 3 * 10 + 2);
    strictEqual(implementer.length, 10 + 2);
  });
});
