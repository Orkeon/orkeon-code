// The start of a dev step (commands/_lib/dev-step.ts) over FakePermissionRules (the host gate), a
// FakeSessionStore holding the session's rules, a config store on FakeFiles and FakeToolCatalogue. It pins
// what /dev-plan and /dev-verify print before launching: the refusal when the host says its gate is off,
// the warning when it cannot say or keeps no session rules, the warning for a session allow the step
// leaves out, and the gate calls (the session's rules, then the step's rule sets). Run:
//   node --test tests/commands-dev-step.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { devVerifyStep, startDevStep } from "../src/commands/_lib/dev-step.ts";
import type { DevStepStart } from "../src/commands/_lib/dev-step.ts";
import { createConfigStore } from "../src/shared/application/config-store.ts";
import { RULE_SET_IDS } from "../src/shared/domain/agent-policy/rule-sets.ts";
import { gateProblem } from "../src/shared/domain/dev/step-rules.ts";
import { PERMISSION_RULES_STATE_KEY } from "../src/shared/domain/session-keys.ts";
import { FakeFiles } from "./support/fake-files.ts";
import { FakePermissionRules } from "./support/fake-permission-rules.ts";
import { FakeSessionStore } from "./support/fake-session-store.ts";
import { FakeToolCatalogue } from "./support/fake-tool-catalogue.ts";

function setup(...stored: string[]) {
  const session = new FakeSessionStore();
  if (stored.length > 0) session.state.set(PERMISSION_RULES_STATE_KEY, JSON.stringify(stored));
  const gate = new FakePermissionRules();
  const config = createConfigStore({ files: new FakeFiles(), session });
  const catalogue = new FakeToolCatalogue();
  return { session, gate, config, catalogue };
}

/** The lines of a step that started; fails the test when it was refused. */
function started(start: DevStepStart): Extract<DevStepStart, { ok: true }> {
  ok(start.ok, "the step was refused");
  return start;
}

describe("startDevStep", () => {
  it("refuses /dev-plan when the host says its gate is off, and leaves the gate alone", async () => {
    const deps = setup();
    deps.gate.hostGate = false;
    deepStrictEqual(await startDevStep("dev-plan", deps), { ok: false, line: gateProblem(false, "dev-plan")!.line });
    deepStrictEqual(deps.gate.calls, []);
  });

  it("refuses /dev-verify the same way, naming --gate-only", async () => {
    const deps = setup();
    deps.gate.hostGate = false;
    const start = await startDevStep("dev-verify", deps);
    ok(!start.ok);
    strictEqual(start.line, gateProblem(false, "dev-verify")!.line);
    ok(start.line.endsWith("--gate-only runs no model and needs no gate."));
    deepStrictEqual(deps.gate.calls, []);
  });

  it("puts the session's rules first, then the 245 rules of the step, and prints nothing", async () => {
    const deps = setup("allow shell_command command=npm test*");
    const start = started(await startDevStep("dev-plan", deps));
    deepStrictEqual(start.lines, []);
    deepStrictEqual(start.sets, RULE_SET_IDS);
    strictEqual(start.rules, 245);
    strictEqual(deps.gate.calls[0], "clear");
    strictEqual(deps.gate.calls[1], "add allow shell_command command=npm test*");
    strictEqual(deps.gate.calls[2], "add deny shell_command command=*git add*");
    strictEqual(deps.gate.calls.length, 247);
  });

  it("warns when the host cannot say, and still puts the sets in force", async () => {
    const deps = setup();
    deps.gate.hostGate = undefined;
    const start = started(await startDevStep("dev-plan", deps));
    deepStrictEqual(start.lines, [gateProblem(undefined, "dev-plan")!.line]);
    strictEqual(deps.gate.calls.length, 246);
  });

  it("warns twice when the host keeps no session rules", async () => {
    const deps = setup();
    deps.gate.kept = false;
    const start = started(await startDevStep("dev-plan", deps));
    deepStrictEqual(start.lines, [
      gateProblem(undefined, "dev-plan")!.line,
      "warning: the host keeps no session rules: /dev-plan's rule sets are not in force, the mode alone decides each call.",
    ]);
    strictEqual(start.rules, 0);
  });

  it("names a session allow the step leaves out", async () => {
    const deps = setup("allow shell_command command=*git push*");
    const start = started(await startDevStep("dev-plan", deps));
    deepStrictEqual(start.lines, [
      "warning: the session's rule 'allow shell_command command=*git push*' is left out of the gate during /dev-plan: " +
        "the step denies the same calls.",
    ]);
  });

  it("hands the gate the session's rules on configured extra tools", async () => {
    const deps = setup("deny create_issue");
    await deps.config.writeSession({ "tools.extra": "create_issue" });
    started(await startDevStep("dev-plan", deps));
    strictEqual(deps.gate.calls[1], "add deny create_issue");
  });
});

describe("devVerifyStep", () => {
  it("runs no step for /dev-verify --gate-only", () => {
    strictEqual(devVerifyStep({ gateOnly: true }), null);
    strictEqual(devVerifyStep({ gateOnly: false }), "dev-verify");
  });
});
