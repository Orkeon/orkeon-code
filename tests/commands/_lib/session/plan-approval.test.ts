// The approval of a plan (commands/_lib/session/plan-approval.ts) over FakeSessionStore, FakeChooser and
// FakeCrewHost. Run:
//   node --test tests/commands/_lib/session/plan-approval.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import {
  approvePlan, carryOutPlan, launchAssistantTurn, notePlanTurn,
} from "../../../../src/commands/_lib/session/plan-approval.ts";
import { CARRY_OUT_PLAN } from "../../../../src/commands/_lib/session/prompts.ts";
import { DEFAULT_MODE_STATE_KEY, PLAN_TURN_STATE_KEY } from "../../../../src/shared/domain/session-keys.ts";
import {
  APPROVALS, APPROVAL_TOLD, FAILURE, KEPT, MAIN_LOOP_RUNNING, NOTED, NOT_OFFERED, NO_ANSWER, REFUSALS, SUCCESS,
  approvalSetup, assistantLaunchSetup,
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

  it("notes no plan turn, without throwing, when the state bag cannot be written", async () => {
    // Arrange
    const { store, session } = approvalSetup({ planTurn: false });
    store.writeStateFailure = new Error("state bag read-only");

    // Act
    const note = await notePlanTurn(session, "plan");

    // Assert
    strictEqual(note.planTurn, false);
  });
});

describe("launchAssistantTurn", () => {
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

  it("launches the turn exclusive, on the main screen", async () => {
    // Arrange
    const { crews, deps } = assistantLaunchSetup();

    // Act
    await launchAssistantTurn(deps, { prompt: "rename parseArgs", permissionMode: null }, true);

    // Assert
    deepStrictEqual(crews.launches[0].options, { onMain: true, exclusive: true });
  });

  it("still launches a plan turn, promised no approval, when the state bag cannot be written", async () => {
    // Arrange
    const { store, crews, deps } = assistantLaunchSetup();
    store.writeStateFailure = new Error("state bag read-only");

    // Act
    await launchAssistantTurn(deps, { prompt: "rename parseArgs", permissionMode: "plan" }, true);

    // Assert
    deepStrictEqual(crews.launches.map((l) => l.input.planApproval === true), [false]);
  });

  it("puts the note back as it was when the launch is refused because another turn runs", async () => {
    // Arrange
    const { store, crews, deps } = assistantLaunchSetup();
    crews.launchFailure = new Error(MAIN_LOOP_RUNNING);

    // Act
    await launchAssistantTurn(deps, { prompt: "rename parseArgs", permissionMode: "plan" }, true);

    // Assert
    strictEqual(store.state.get(PLAN_TURN_STATE_KEY) ?? undefined, undefined);
  });
});

describe("carryOutPlan", () => {
  it("launches the request that carries the plan out, in the mode picked, exclusive", async () => {
    // Arrange
    const { crews, deps } = assistantLaunchSetup("plan");

    // Act
    await carryOutPlan(deps, "acceptEdits");

    // Assert
    const { input, options } = crews.launches[0];
    deepStrictEqual([input.prompt, input.permissionMode, options], [CARRY_OUT_PLAN, "acceptEdits", { onMain: true, exclusive: true }]);
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

  for (const c of NO_ANSWER) {
    it(`asks nothing after a plan turn that succeeded with ${c.name}`, async () => {
      // Arrange
      const { chooser, deps } = approvalSetup();

      // Act
      await approvePlan({ success: true, payload: c.payload }, deps);

      // Assert
      strictEqual(chooser.asked.length, 0);
    });

    it(`prints no hint on a console without panels after ${c.name}`, async () => {
      // Arrange
      const { chooser, deps } = approvalSetup();
      chooser.interactive = false;

      // Act
      const decision = await approvePlan({ success: true, payload: c.payload }, deps);

      // Assert
      deepStrictEqual(decision, { lines: [] });
    });
  }

  it("asks nothing when the note cannot be read", async () => {
    // Arrange
    const { store, chooser, deps } = approvalSetup();
    store.readStateFailure = new Error("state bag unreadable");

    // Act
    await approvePlan(SUCCESS, deps);

    // Assert
    strictEqual(chooser.asked.length, 0);
  });

  it("asks nothing, without throwing, when the note cannot be cleared", async () => {
    // Arrange
    const { store, chooser, deps } = approvalSetup();
    store.writeStateFailure = new Error("state bag read-only");

    // Act
    await approvePlan(SUCCESS, deps);

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
