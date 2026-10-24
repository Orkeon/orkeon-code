// The rule sets each dev step holds, a role's rules on the pack's roots, and what a step says
// when the host's gate is off or cannot say. Run:
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
    strictEqual(stepRules("dev-plan").length, 245);
  });
});

describe("gateProblem", () => {
  it("says nothing when the gate is on, warns when the host cannot say, refuses when it is off", () => {
    strictEqual(gateProblem(true, "dev-plan"), null);
    deepStrictEqual(gateProblem(undefined, "dev-plan"), {
      refuse: false,
      line: "warning: the host does not say whether its permission gate is on (a runtime before Orkeon #128): " +
        "/dev-plan runs, and its rule sets hold only if Orkeon:Security:PermissionGate:Enabled is true.",
    });
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
    deepStrictEqual(pilot.rules.map(formatRule), [
      "deny file_read path=/workspace/src/core/Orkeon.Domain/*",
      "deny file_read path=src/core/Orkeon.Domain/*",
      "deny file_read path=/workspace/tests/*",
      "deny file_read path=tests/*",
    ]);
    deepStrictEqual(pilot.missing, ["layout.application", "layout.infrastructure"]);
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
  });
});
