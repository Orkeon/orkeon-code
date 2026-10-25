// The start of a dev step (commands/_lib/dev-step.ts) over FakePermissionRules (the host gate), a
// FakeSessionStore holding the session's rules, a config store on FakeFiles and FakeToolCatalogue. It pins
// what /dev-plan and /dev-verify print before launching: the refusal when the host says its gate is off,
// the warning when it keeps no session rules, the warning for a session allow the step
// leaves out, and the gate calls (the session's rules, then the step's rule sets). Run:
//   node --test tests/commands-dev-step.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import {
  activeWorkflowOf, devVerifyStep, markActiveWorkflow, readWriteModeRefusal, reapplyStepRules, startDevStep, writeModeRefusal,
} from "../src/commands/_lib/dev-step.ts";
import { WORKFLOW_ACTIVE_STATE_KEY } from "../src/shared/domain/session-keys.ts";
import { RULE_SET_IDS } from "../src/shared/domain/agent-policy/rule-sets.ts";
import { gateProblem } from "../src/shared/domain/dev/step-rules.ts";
import { HOOKS_STATE_KEY } from "../src/shared/domain/session-keys.ts";
import { FakeSessionStore } from "./support/doubles/fake-session-store.ts";
import {
  ACTIVE_WORKFLOW_CASES,
  HOOKS_CASES,
  LEFT_OUT_ALLOW_WARNING,
  MEMORY_RECALL_CASES,
  NO_SESSION_RULES_WARNING,
  READ_MODE_REFUSAL_CASES,
  REFUSED_MODE_CASES,
  VERIFY_STEP_CASES,
  WRITING_MODE_CASES,
  failingStateSession,
  modeReader,
  stepDeps,
} from "./commands-dev-step.fixtures.ts";
import { assertStarted } from "./commands-dev-step.assertions.ts";

describe("startDevStep", () => {
  for (const c of HOOKS_CASES) {
    it(c.name, async () => {
      // Arrange
      const deps = stepDeps();
      if (c.stored !== null) deps.session.state.set(HOOKS_STATE_KEY, c.stored);

      // Act
      const start = await startDevStep(c.step, deps);

      // Assert
      assertStarted(start);
      deepStrictEqual(start.hooks, c.expected);
    });
  }

  it("refuses /dev-plan when the host says its gate is off, and leaves the gate alone", async () => {
    // Arrange
    const deps = stepDeps();
    deps.gate.hostGate = false;

    // Act
    const start = await startDevStep("dev-plan", deps);

    // Assert
    deepStrictEqual(start, { ok: false, line: gateProblem(false, "dev-plan")!.line });
    deepStrictEqual(deps.gate.calls, []);
  });

  it("refuses /dev-verify the same way, naming --gate-only", async () => {
    // Arrange
    const deps = stepDeps();
    deps.gate.hostGate = false;

    // Act
    const start = await startDevStep("dev-verify", deps);

    // Assert
    ok(!start.ok);
    strictEqual(start.line, gateProblem(false, "dev-verify")!.line);
    ok(start.line.endsWith("--gate-only runs no model and needs no gate."));
    deepStrictEqual(deps.gate.calls, []);
  });

  it("puts the session's rules first, then the 534 rules of the step, and prints nothing", async () => {
    // Arrange
    const deps = stepDeps("allow shell_command command=npm test*");

    // Act
    const start = await startDevStep("dev-plan", deps);

    // Assert
    assertStarted(start);
    deepStrictEqual(start.lines, []);
    deepStrictEqual(start.sets, RULE_SET_IDS);
    strictEqual(start.rules, 534);
    strictEqual(deps.gate.calls[0], "clear");
    strictEqual(deps.gate.calls[1], "add allow shell_command command=npm test*");
    strictEqual(deps.gate.calls[2], "add deny shell_command command=*git add*");
    // Then the shared memory's guard, 20 denies: no model tool writes its candidates or entries.
    strictEqual(deps.gate.calls.length, 558);
    strictEqual(deps.gate.calls[557], "add deny shell_command command=*.orkeon/memory/entries*");
  });

  it("prints nothing when the facade does not say whether the gate is on, and still puts the sets in force", async () => {
    // Arrange
    const deps = stepDeps();
    deps.gate.hostGate = undefined;

    // Act
    const start = await startDevStep("dev-plan", deps);

    // Assert
    assertStarted(start);
    deepStrictEqual(start.lines, []);
    strictEqual(deps.gate.calls.length, 557);
  });

  it("finds no gate problem when the facade does not say whether the gate is on", () => {
    // Arrange
    const hostGate = undefined;

    // Act
    const problem = gateProblem(hostGate, "dev-plan");

    // Assert
    strictEqual(problem, null);
  });

  it("warns once when the host keeps no session rules", async () => {
    // Arrange
    const deps = stepDeps();
    deps.gate.kept = false;

    // Act
    const start = await startDevStep("dev-plan", deps);

    // Assert
    assertStarted(start);
    deepStrictEqual(start.lines, [NO_SESSION_RULES_WARNING]);
    strictEqual(start.rules, 0);
  });

  for (const c of MEMORY_RECALL_CASES) {
    it(c.name, async () => {
      // Arrange
      const deps = stepDeps(...c.stored);

      // Act
      const start = await startDevStep("dev-plan", deps);

      // Assert
      assertStarted(start);
      deepStrictEqual(start.input, c.input);
    });
  }

  it("names a session allow the step leaves out", async () => {
    // Arrange
    const deps = stepDeps("allow shell_command command=*git push*");

    // Act
    const start = await startDevStep("dev-plan", deps);

    // Assert
    assertStarted(start);
    deepStrictEqual(start.lines, [LEFT_OUT_ALLOW_WARNING]);
  });

  it("hands the gate the session's rules on configured extra tools", async () => {
    // Arrange
    const deps = stepDeps("deny create_issue");
    await deps.config.writeSession({ "tools.extra": "create_issue" });

    // Act
    const start = await startDevStep("dev-plan", deps);

    // Assert
    assertStarted(start);
    strictEqual(deps.gate.calls[1], "add deny create_issue");
  });
});

describe("devVerifyStep", () => {
  for (const c of VERIFY_STEP_CASES) {
    it(c.name, () => {
      // Arrange
      const options = { gateOnly: c.gateOnly };

      // Act
      const step = devVerifyStep(options);

      // Assert
      strictEqual(step, c.expected);
    });
  }
});

describe("the batch a step records as in progress", () => {
  for (const c of ACTIVE_WORKFLOW_CASES) {
    it(c.name, () => {
      // Arrange
      const { input } = c;

      // Act
      const active = activeWorkflowOf(input);

      // Assert
      deepStrictEqual(active, c.expected);
    });
  }

  it("writes the pointer in the session", async () => {
    // Arrange
    const session = new FakeSessionStore();

    // Act
    const warning = await markActiveWorkflow(session, { batch: "F2", plan: "demo" });

    // Assert
    strictEqual(warning, null);
    strictEqual(session.state.get(WORKFLOW_ACTIVE_STATE_KEY), `{"code":"demo","phase":"F2"}`);
  });

  it("turns a failure to write the pointer into a warning line", async () => {
    // Arrange
    const session = failingStateSession();

    // Act
    const warning = await markActiveWorkflow(session, { batch: "F2", plan: null });

    // Assert
    strictEqual(warning, "warning: the batch in progress could not be recorded (no state bag): a compaction will write no state file for it.");
  });
});

describe("reapplyStepRules", () => {
  it("refuses a chained launch when the gate is off, and leaves the gate alone", () => {
    // Arrange
    const { gate } = stepDeps();
    gate.hostGate = false;

    // Act
    const refusal = reapplyStepRules(gate, "dev-verify");

    // Assert
    strictEqual(refusal, gateProblem(false, "dev-verify")!.line);
    deepStrictEqual(gate.calls, []);
  });

  it("puts the step's rules back on top of what the gate holds, without clearing it", () => {
    // Arrange
    const { gate } = stepDeps();

    // Act
    const refusal = reapplyStepRules(gate, "dev-implement");

    // Assert
    strictEqual(refusal, null);
    strictEqual(gate.calls.includes("clear"), false);
    ok(gate.calls.some((c) => c.startsWith("add allow run_tests")), gate.calls.slice(-3).join(" | "));
  });
});

describe("writeModeRefusal", () => {
  for (const c of WRITING_MODE_CASES) {
    it(c.name, () => {
      // Arrange
      const { mode, step } = c;

      // Act
      const refusal = writeModeRefusal(mode, step, "writes files");

      // Assert
      strictEqual(refusal, null);
    });
  }

  for (const c of REFUSED_MODE_CASES) {
    it(c.name, () => {
      // Arrange
      const { mode, step } = c;

      // Act
      const refusal = writeModeRefusal(mode, step, "writes files");

      // Assert
      strictEqual(refusal, c.expected);
    });
  }

  it("reads the session's mode, and lets a writing step run in a mode that writes", async () => {
    // Arrange
    const reader = modeReader("default");

    // Act
    const refusal = await readWriteModeRefusal(reader, "dev-spec", "writes files");

    // Assert
    strictEqual(refusal, null);
  });

  for (const c of READ_MODE_REFUSAL_CASES) {
    it(c.name, async () => {
      // Arrange
      const reader = modeReader(c.mode);

      // Act
      const refusal = await readWriteModeRefusal(reader, "dev-spec", "writes files");

      // Assert
      ok(refusal?.includes(c.fragment), String(refusal));
    });
  }
});
