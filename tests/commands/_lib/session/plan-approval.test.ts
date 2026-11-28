// The approval of a plan (commands/_lib/session/plan-approval.ts) over FakeSessionStore, FakeChooser and
// FakeCrewHost. Run:
//   node --test tests/commands/_lib/session/plan-approval.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import {
  PLAN_TURN_STATE, approvePlan, carryOutPlan, launchAssistantTurn,
} from "../../../../src/commands/_lib/session/plan-approval.ts";
import { CARRY_OUT_PLAN } from "../../../../src/commands/_lib/session/prompts.ts";
import { DEFAULT_MODE_STATE_KEY } from "../../../../src/shared/domain/session-keys.ts";
import {
  APPROVALS, APPROVAL_TOLD, ATTACHED, FAILURE, FOREIGN_STATES, KEPT, NOT_OFFERED, NO_ANSWER, NO_STATE, REFUSALS,
  SUCCESS, approvalSetup, assistantLaunchSetup,
} from "./plan-approval.fixtures.ts";

describe("launchAssistantTurn", () => {
  for (const c of ATTACHED) {
    it(c.name, async () => {
      // Arrange
      const { crews, deps } = assistantLaunchSetup(c.session);

      // Act
      await launchAssistantTurn(deps, { prompt: "rename parseArgs", permissionMode: c.prefix }, true);

      // Assert
      deepStrictEqual(crews.launches[0].options?.state, c.planTurn ? PLAN_TURN_STATE : undefined);
    });
  }

  for (const c of APPROVAL_TOLD) {
    it(c.name, async () => {
      // Arrange
      const { crews, deps } = assistantLaunchSetup();

      // Act
      await launchAssistantTurn(deps, { prompt: "rename parseArgs", permissionMode: c.prefix }, c.interactive);

      // Assert
      strictEqual(crews.launches[0].input.planApproval === true, c.told);
    });
  }

  it("launches the turn on the main screen, not exclusive", async () => {
    // Arrange
    const { crews, deps } = assistantLaunchSetup();

    // Act
    await launchAssistantTurn(deps, { prompt: "rename parseArgs", permissionMode: null }, true);

    // Assert
    deepStrictEqual(crews.launches[0].options, { onMain: true });
  });
});

describe("carryOutPlan", () => {
  it("launches the request that carries the plan out, in the mode picked, on the main screen, with no state", async () => {
    // Arrange
    const { crews, deps } = assistantLaunchSetup("plan");

    // Act
    await carryOutPlan(deps, "acceptEdits");

    // Assert
    const { input, options } = crews.launches[0];
    deepStrictEqual([input.prompt, input.permissionMode, options], [CARRY_OUT_PLAN, "acceptEdits", { onMain: true }]);
  });
});

describe("approvePlan", () => {
  it("asks after a plan turn whose launch attached the plan turn's state", async () => {
    // Arrange
    const { chooser, deps } = approvalSetup();

    // Act
    await approvePlan(SUCCESS, deps);

    // Assert
    strictEqual(chooser.asked.length, 1);
  });

  it("asks nothing after a turn whose launch attached no state", async () => {
    // Arrange
    const { chooser, deps } = approvalSetup();

    // Act
    await approvePlan(NO_STATE, deps);

    // Assert
    strictEqual(chooser.asked.length, 0);
  });

  for (const c of FOREIGN_STATES) {
    it(`asks nothing, without throwing, after a completion whose state is ${c.name}`, async () => {
      // Arrange
      const { chooser, deps } = approvalSetup();

      // Act
      const decision = await approvePlan({ ...SUCCESS, state: c.state }, deps);

      // Assert
      deepStrictEqual([decision, chooser.asked.length], [{ lines: [] }, 0]);
    });
  }

  it("asks nothing after a plan turn that failed", async () => {
    // Arrange
    const { chooser, deps } = approvalSetup();

    // Act
    await approvePlan(FAILURE, deps);

    // Assert
    strictEqual(chooser.asked.length, 0);
  });

  for (const c of NO_ANSWER) {
    it(`asks nothing after a plan turn that succeeded with ${c.name}`, async () => {
      // Arrange
      const { chooser, deps } = approvalSetup();

      // Act
      await approvePlan({ ...SUCCESS, payload: c.payload }, deps);

      // Assert
      strictEqual(chooser.asked.length, 0);
    });

    it(`prints no hint on a console without panels after ${c.name}`, async () => {
      // Arrange
      const { chooser, deps } = approvalSetup();
      chooser.interactive = false;

      // Act
      const decision = await approvePlan({ ...SUCCESS, payload: c.payload }, deps);

      // Assert
      deepStrictEqual(decision, { lines: [] });
    });
  }

  it("offers to accept edits, to ask before each edit, or to keep planning", async () => {
    // Arrange
    const { chooser, deps } = approvalSetup();

    // Act
    await approvePlan(SUCCESS, deps);

    // Assert
    deepStrictEqual(chooser.asked[0].options.map((o) => o.value), ["acceptEdits", "default", "plan"]);
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

  it("stores the mode picked when the session is in plan through the permissions.fallback setting", async () => {
    // Arrange
    const { store, config, deps } = approvalSetup({ answer: "acceptEdits" });
    await config.writeSession({ "permissions.fallback": "plan" });

    // Act
    await approvePlan(SUCCESS, deps);

    // Assert
    strictEqual(store.state.get(DEFAULT_MODE_STATE_KEY), "acceptEdits");
  });

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
