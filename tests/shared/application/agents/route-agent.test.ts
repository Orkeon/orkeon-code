// The profile a crew is launched on, over fakes. Run:
//   node --test tests/shared/application/agents/route-agent.test.ts
import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";

import { actRoute, routeAgent } from "../../../../src/shared/application/agents/route-agent.ts";
import {
  ACT_ROUTES, BILLING_TASK, NOT_ASKED, NO_ANSWER_LINE, NO_MODEL_WARNING, OPTIONS_CASES, OUTSIDE_LADDER_LINE, REASON_CASES,
  REVIEWER_LINE, REVIEW_TASK, ROUTED_SMALL_LINE, RULES_PATH, SMALL_RECORD, TASK, actRouteSetup, answer, routeSetup,
} from "./route-agent.fixtures.ts";

describe("routeAgent", () => {
  for (const setting of ["off", null]) {
    it(`keeps the session's profile and asks nothing when route.agents is ${setting ?? "unset"}`, async () => {
      // Arrange
      const { deps, picker } = routeSetup(setting);

      // Act
      const profile = await routeAgent(deps, TASK, "large");

      // Assert
      deepStrictEqual([profile, picker.asked.length], ["large", 0]);
    });
  }

  it("keeps the session's profile, asks nothing and says why when the host has no decision model", async () => {
    // Arrange
    const { deps, decision, picker, log } = routeSetup();
    decision.present = false;

    // Act
    const profile = await routeAgent(deps, TASK, "large");

    // Assert
    deepStrictEqual([profile, picker.asked.length, log.lines], ["large", 0, [NO_MODEL_WARNING]]);
  });

  it("keeps a session's profile that is not on the ladder, and asks nothing", async () => {
    // Arrange
    const { deps, picker, log } = routeSetup();

    // Act
    const profile = await routeAgent(deps, TASK, "guarded");

    // Assert
    deepStrictEqual([profile, picker.asked.length, log.lines], ["guarded", 0, [OUTSIDE_LADDER_LINE]]);
  });

  it("asks the pick about the crew and the command", async () => {
    // Arrange
    const { deps, picker } = routeSetup();

    // Act
    await routeAgent(deps, TASK, null);

    // Assert
    deepStrictEqual(
      [picker.asked[0].request.includes("'dev-plan'"), picker.asked[0].request.endsWith("\n/dev-plan invoice-export")],
      [true, true],
    );
  });

  for (const c of OPTIONS_CASES) {
    it(c.name, async () => {
      // Arrange
      const { deps, picker, files, config } = routeSetup();
      if (c.rules !== null) files.files.set(RULES_PATH, c.rules);
      if (c.ladder !== undefined) config.values["route.ladder"] = c.ladder;

      // Act
      await routeAgent(deps, c.task, c.session);

      // Assert
      deepStrictEqual(picker.asked[0].options, c.options);
    });
  }

  it("gives no floor when the rules file cannot be read", async () => {
    // Arrange
    const { deps, picker, files } = routeSetup();
    files.readErrors.set(RULES_PATH, new Error("access denied"));

    // Act
    await routeAgent(deps, BILLING_TASK, null);

    // Assert
    deepStrictEqual(picker.asked[0].options, { ladder: ["small", "large"] });
  });

  for (const c of REASON_CASES) {
    it(c.name, async () => {
      // Arrange
      const { deps, picker } = routeSetup();
      picker.answer = c.answer;

      // Act
      const profile = await routeAgent(deps, TASK, c.session);

      // Assert
      strictEqual(profile, c.profile);
    });
  }

  it("says on which rung the crew is launched, and why", async () => {
    // Arrange
    const { deps, log } = routeSetup();

    // Act
    await routeAgent(deps, TASK, "large");

    // Assert
    deepStrictEqual(log.lines, [ROUTED_SMALL_LINE]);
  });

  it("says the crew runs on the host's default model when the pick falls back on it", async () => {
    // Arrange
    const { deps, picker, log } = routeSetup();
    picker.answer = answer(null, "no-answer");

    // Act
    await routeAgent(deps, TASK, null);

    // Assert
    deepStrictEqual(log.lines, [NO_ANSWER_LINE]);
  });

  for (const c of NOT_ASKED) {
    it(c.name, async () => {
      // Arrange
      const { deps, picker, log, session } = routeSetup();
      picker.answer = c.answer;

      // Act
      await routeAgent(deps, TASK, "large");

      // Assert
      deepStrictEqual([log.lines, session.state.has("route_recent")], [[], false]);
    });
  }

  it("keeps the choice in the session, for /route why", async () => {
    // Arrange
    const { deps, session } = routeSetup();

    // Act
    await routeAgent(deps, TASK, "large");

    // Assert
    deepStrictEqual(JSON.parse(session.state.get("route_recent") ?? "[]"), SMALL_RECORD);
  });

  it("routes all the same when the choice cannot be kept", async () => {
    // Arrange
    const { deps, session, picker } = routeSetup();
    picker.answer = answer("large", "model", "large", 0.9);
    session.writeStateFailure = new Error("no session");

    // Act
    const profile = await routeAgent(deps, TASK, null);

    // Assert
    strictEqual(profile, "large");
  });
});

describe("actRoute", () => {
  for (const c of ACT_ROUTES) {
    it(c.name, async () => {
      // Arrange
      const { deps } = actRouteSetup(c);

      // Act
      const profile = await actRoute(deps, c.profiles)(REVIEW_TASK);

      // Assert
      strictEqual(profile, c.profile);
    });
  }

  it("asks under the sub-agent's name and says where its act runs", async () => {
    // Arrange
    const { deps, log } = routeSetup();

    // Act
    await actRoute(deps, { session: "large", crew: "large" })(REVIEW_TASK);

    // Assert
    deepStrictEqual(log.lines, [REVIEWER_LINE]);
  });
});
