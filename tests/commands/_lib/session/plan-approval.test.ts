// The approval of a plan (commands/_lib/session/plan-approval.ts) over FakeSessionStore and FakeChooser. Run:
//   node --test tests/commands/_lib/session/plan-approval.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { approvePlan, notePlanTurn } from "../../../../src/commands/_lib/session/plan-approval.ts";
import { DEFAULT_MODE_STATE_KEY, PLAN_TURN_STATE_KEY } from "../../../../src/shared/domain/session-keys.ts";
import {
  APPROVALS, FAILURE, KEPT, NOTED, NOT_OFFERED, REFUSALS, SUCCESS, approvalSetup,
} from "./plan-approval.fixtures.ts";

describe("notePlanTurn", () => {
  for (const c of NOTED) {
    it(c.name, async () => {
      // Arrange
      const { store, session } = approvalSetup({ mode: c.session, planTurn: false });

      // Act
      await notePlanTurn(session, c.prefix);

      // Assert
      strictEqual(store.state.get(PLAN_TURN_STATE_KEY) ?? undefined, c.held);
    });
  }

  it("drops the note of an earlier plan turn when the turn writes", async () => {
    // Arrange
    const { store, session } = approvalSetup({ mode: "default", planTurn: true });

    // Act
    await notePlanTurn(session, null);

    // Assert
    strictEqual(store.state.get(PLAN_TURN_STATE_KEY) ?? undefined, undefined);
  });
});

describe("approvePlan", () => {
  it("asks nothing after a turn that was no plan turn", async () => {
    // Arrange
    const { chooser, deps } = approvalSetup({ planTurn: false });

    // Act
    await approvePlan(SUCCESS, deps);

    // Assert
    strictEqual(chooser.asked.length, 0);
  });

  it("asks nothing after a plan turn that failed", async () => {
    // Arrange
    const { chooser, deps } = approvalSetup();

    // Act
    await approvePlan(FAILURE, deps);

    // Assert
    strictEqual(chooser.asked.length, 0);
  });

  it("offers to accept edits, to ask before each edit, or to keep planning", async () => {
    // Arrange
    const { chooser, deps } = approvalSetup();

    // Act
    await approvePlan(SUCCESS, deps);

    // Assert
    deepStrictEqual(chooser.asked[0].options.map((o) => o.value), ["acceptEdits", "default", "plan"]);
  });

  it("forgets the plan turn once asked, so the turn that carries it out asks nothing", async () => {
    // Arrange
    const { store, deps } = approvalSetup({ answer: "acceptEdits" });

    // Act
    await approvePlan(SUCCESS, deps);

    // Assert
    strictEqual(store.state.get(PLAN_TURN_STATE_KEY) ?? undefined, undefined);
  });

  for (const mode of APPROVALS) {
    it(`carries the plan out in ${mode} when that answer is picked`, async () => {
      // Arrange
      const { deps } = approvalSetup({ mode: "plan", answer: mode });

      // Act
      const decision = await approvePlan(SUCCESS, deps);

      // Assert
      deepStrictEqual(decision, { lines: [`plan approved: carrying it out in '${mode}'.`], carryOut: mode });
    });

    it(`moves a session in plan mode to ${mode} on that answer`, async () => {
      // Arrange
      const { store, deps } = approvalSetup({ mode: "plan", answer: mode });

      // Act
      await approvePlan(SUCCESS, deps);

      // Assert
      strictEqual(store.state.get(DEFAULT_MODE_STATE_KEY), mode);
    });
  }

  it("leaves the mode of a session that was not in plan mode, the plan turn being a prefixed one", async () => {
    // Arrange
    const { store, deps } = approvalSetup({ mode: "bypassPermissions", answer: "acceptEdits" });

    // Act
    await approvePlan(SUCCESS, deps);

    // Assert
    strictEqual(store.state.get(DEFAULT_MODE_STATE_KEY), "bypassPermissions");
  });

  for (const c of REFUSALS) {
    it(`carries nothing out on ${c.name}`, async () => {
      // Arrange
      const { deps } = approvalSetup({ mode: "plan", answer: c.answer });

      // Act
      const decision = await approvePlan(SUCCESS, deps);

      // Assert
      deepStrictEqual(decision, { lines: [KEPT] });
    });

    it(`keeps the session in plan mode on ${c.name}`, async () => {
      // Arrange
      const { store, deps } = approvalSetup({ mode: "plan", answer: c.answer });

      // Act
      await approvePlan(SUCCESS, deps);

      // Assert
      strictEqual(store.state.get(DEFAULT_MODE_STATE_KEY), "plan");
    });
  }

  it("says how to carry the plan out on a console without panels", async () => {
    // Arrange
    const { chooser, deps } = approvalSetup({ mode: "plan" });
    chooser.interactive = false;

    // Act
    const decision = await approvePlan(SUCCESS, deps);

    // Assert
    deepStrictEqual(decision, { lines: [NOT_OFFERED] });
  });
});
