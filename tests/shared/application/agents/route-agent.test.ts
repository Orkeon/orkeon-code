// The profile a crew is launched on, over fakes. Run:
//   node --test tests/shared/application/agents/route-agent.test.ts
import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";

import { actRoute, routeAgent } from "../../../../src/shared/application/agents/route-agent.ts";
import {
  ACT_LINES, ACT_ROUTES, BILLING_TASK, HELD_CASES, LINE_CASES, NO_CHOICE, NO_MODEL_WARNING, OPTIONS_CASES, OUTSIDE_LADDER_LINE,
  REASON_CASES, REVIEW_TASK, RULES_PATH, SMALL_RECORD, TASK, UNSURE_RECORD, answer, answeredSetup, routeSetup,
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

  for (const c of HELD_CASES) {
    it(c.name, async () => {
      // Arrange
      const { deps, picker, log, session } = routeSetup("on", c);

      // Act
      const profile = await routeAgent(deps, c.task, c.session);

      // Assert
      deepStrictEqual([profile, picker.asked.length, log.lines, session.state.has("route_recent")], [c.session, 0, [], false]);
    });
  }

  it("sends the pick one lead line that names the crew, then the command", async () => {
    // Arrange
    const { deps, picker } = routeSetup();

    // Act
    await routeAgent(deps, TASK, null);

    // Assert
    strictEqual(picker.asked[0].request, "Run the crew 'dev-plan' of a coding assistant for this command of its user:\n/dev-plan invoice-export");
  });

  for (const c of OPTIONS_CASES) {
    it(c.name, async () => {
      // Arrange
      const { deps, picker } = routeSetup("on", c);

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
      const { deps } = answeredSetup(c);

      // Act
      const profile = await routeAgent(deps, TASK, c.session);

      // Assert
      strictEqual(profile, c.profile);
    });
  }

  for (const c of LINE_CASES) {
    it(c.name, async () => {
      // Arrange
      const { deps, log } = answeredSetup(c);

      // Act
      await routeAgent(deps, TASK, c.session);

      // Assert
      deepStrictEqual(log.lines, c.lines);
    });
  }

  for (const c of NO_CHOICE) {
    it(c.name, async () => {
      // Arrange
      const { deps, log, session } = answeredSetup(c);

      // Act
      await routeAgent(deps, TASK, "large");

      // Assert
      deepStrictEqual([log.lines, session.state.has("route_recent")], [c.lines, false]);
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

  it("keeps what stood with a choice that decided nothing", async () => {
    // Arrange
    const { deps, session } = answeredSetup({ answer: answer("large", "low-confidence", "small", 0.4) });

    // Act
    await routeAgent(deps, TASK, "large");

    // Assert
    deepStrictEqual(JSON.parse(session.state.get("route_recent") ?? "[]"), UNSURE_RECORD);
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
      const { deps } = answeredSetup(c);

      // Act
      const profile = await actRoute(deps, c.profiles)(REVIEW_TASK);

      // Assert
      strictEqual(profile, c.profile);
    });
  }

  for (const c of ACT_LINES) {
    it(c.name, async () => {
      // Arrange
      const { deps, log } = answeredSetup(c);

      // Act
      await actRoute(deps, c.profiles)(REVIEW_TASK);

      // Assert
      deepStrictEqual(log.lines, c.lines);
    });
  }
});
