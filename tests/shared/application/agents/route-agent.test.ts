// The profile a crew is launched on, over fakes. Run:
//   node --test tests/shared/application/agents/route-agent.test.ts
import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";

import { actRoute, routeAgent } from "../../../../src/shared/application/agents/route-agent.ts";
import {
  ACT_EFFORTS, ACT_LINES, ACT_ROUTES, BILLING_TASK, EFFORT_ASKED_CASES, EFFORT_LINE_CASES, EFFORT_RECORD, EFFORT_ROUTED_CASES, LOW_PICKED, THINKING_TASK, effortSetup, HELD_CASES, LINE_CASES, NO_CHOICE, NO_MODEL_WARNING, OPTIONS_CASES, OUTSIDE_LADDER_LINE,
  REASON_CASES, REVIEW_TASK, RULES_PATH, SMALL_RECORD, TASK, UNSURE_RECORD, answer, answeredSetup, routeSetup,
  LADDER_REFUSED_LINES, MISREAD_LADDERS, REFUSAL, RETRY_CASES, levelRefusedSetup, EFFORT_REFUSAL, LEVEL_REFUSED_TWO_ACTS_LINES,
  MISREAD_AND_OUTSIDE_LINES, MISREAD_TWO_ACTS_LINES, MISREAD_TWO_LAUNCHES_LINES, MISREAD_UNASKED_CASES, UNNAMED_REFUSAL, UNNAMED_REFUSED_LINES,
} from "./route-agent.fixtures.ts";

describe("routeAgent", () => {
  for (const setting of ["off", null]) {
    it(`keeps the session's profile and asks nothing when route.agents is ${setting ?? "unset"}`, async () => {
      // Arrange
      const { deps, picker } = routeSetup(setting);

      // Act
      const { profile } = await routeAgent(deps, TASK, "large");

      // Assert
      deepStrictEqual([profile, picker.asked.length], ["large", 0]);
    });
  }

  it("keeps the session's profile, asks nothing and says why when the host has no decision model", async () => {
    // Arrange
    const { deps, decision, picker, log } = routeSetup();
    decision.present = false;

    // Act
    const { profile } = await routeAgent(deps, TASK, "large");

    // Assert
    deepStrictEqual([profile, picker.asked.length, log.lines], ["large", 0, [NO_MODEL_WARNING]]);
  });

  it("routes a session whose llm.profile is a rung spelled in another case", async () => {
    // Arrange
    const { deps, picker } = routeSetup("on", { ladder: "small,large" });

    // Act
    await routeAgent(deps, TASK, "Large");

    // Assert
    strictEqual(picker.asked.length, 1);
  });

  it("keeps a session's profile that is not on the ladder, and asks nothing", async () => {
    // Arrange
    const { deps, picker, log } = routeSetup();

    // Act
    const { profile } = await routeAgent(deps, TASK, "guarded");

    // Assert
    deepStrictEqual([profile, picker.asked.length, log.lines], ["guarded", 0, [OUTSIDE_LADDER_LINE]]);
  });

  for (const c of HELD_CASES) {
    it(c.name, async () => {
      // Arrange
      const { deps, picker, log, session } = routeSetup("on", c);

      // Act
      const { profile } = await routeAgent(deps, c.task, c.session);

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
      const { profile } = await routeAgent(deps, TASK, c.session);

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
    const { profile } = await routeAgent(deps, TASK, null);

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
      const { profile } = await actRoute(deps, c.profiles)(REVIEW_TASK);

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

describe("routeAgent, the thinking level", () => {
  for (const c of EFFORT_ASKED_CASES) {
    it(c.name, async () => {
      // Arrange
      const { deps, picker } = effortSetup(c);

      // Act
      await routeAgent(deps, c.task, "large");

      // Assert
      deepStrictEqual(picker.asked[0].effort, c.effort);
    });
  }

  it("asks for any level of the host when the session cannot say what /effort stored", async () => {
    // Arrange
    const { deps, picker, session } = effortSetup({ stored: "high" });
    session.readStateFailure = new Error("no session");

    // Act
    await routeAgent(deps, THINKING_TASK, "large");

    // Assert
    deepStrictEqual(picker.asked[0].effort, {});
  });

  for (const c of EFFORT_ROUTED_CASES) {
    it(c.name, async () => {
      // Arrange
      const { deps } = effortSetup(c);

      // Act
      const { effort } = await routeAgent(deps, THINKING_TASK, "large");

      // Assert
      strictEqual(effort, c.level);
    });
  }

  for (const c of EFFORT_LINE_CASES) {
    it(c.name, async () => {
      // Arrange
      const { deps, log } = effortSetup(c);

      // Act
      await routeAgent(deps, THINKING_TASK, "large");

      // Assert
      deepStrictEqual(log.lines, c.lines);
    });
  }

  it("ignores a level the pick answers when none was asked", async () => {
    // Arrange
    const { deps } = effortSetup({ answer: LOW_PICKED });

    // Act
    const { effort } = await routeAgent(deps, TASK, "large");

    // Assert
    strictEqual(effort, null);
  });

  it("keeps the level picked with the choice, for /route why", async () => {
    // Arrange
    const { deps, session } = effortSetup({ answer: LOW_PICKED });

    // Act
    await routeAgent(deps, THINKING_TASK, "large");

    // Assert
    deepStrictEqual(JSON.parse(session.state.get("route_recent") ?? "[]"), EFFORT_RECORD);
  });
});

describe("actRoute, the thinking level", () => {
  it("asks for the level of an act, which always takes one", async () => {
    // Arrange
    const { deps, picker } = effortSetup({ stored: "high" });

    // Act
    await actRoute(deps, { session: "large", crew: "large" })(REVIEW_TASK);

    // Assert
    deepStrictEqual(picker.asked[0].effort, { max: "high" });
  });

  for (const c of ACT_EFFORTS) {
    it(c.name, async () => {
      // Arrange
      const { deps } = effortSetup(c);

      // Act
      const routed = await actRoute(deps, { session: "large", crew: "small" })(REVIEW_TASK);

      // Assert
      deepStrictEqual(routed, c.routed);
    });
  }
});

describe("routeAgent, a pick refused with a thinking level", () => {
  it("asks the pick once more without the level when the runtime refuses the level part", async () => {
    // Arrange
    const { deps, picker } = levelRefusedSetup();

    // Act
    await routeAgent(deps, THINKING_TASK, "large");

    // Assert
    deepStrictEqual(picker.asked.map((asked) => asked.effort), [{ max: "low" }, undefined]);
  });

  it("leaves the level in place, whatever level the pick asked alone holds", async () => {
    // Arrange
    const { deps } = levelRefusedSetup(LOW_PICKED);

    // Act
    const { effort } = await routeAgent(deps, THINKING_TASK, "large");

    // Assert
    strictEqual(effort, null);
  });

  for (const c of RETRY_CASES) {
    it(c.name, async () => {
      // Arrange
      const { deps, log } = levelRefusedSetup(c.second);

      // Act
      const { profile } = await routeAgent(deps, THINKING_TASK, "large");

      // Assert
      deepStrictEqual([profile, log.lines], [c.profile, c.lines]);
    });
  }

  it("asks once when the runtime refuses the ladder with a level asked", async () => {
    // Arrange
    const { deps, picker } = effortSetup({ stored: "high", answer: REFUSAL });

    // Act
    await routeAgent(deps, THINKING_TASK, "large");

    // Assert
    strictEqual(picker.asked.length, 1);
  });

  it("warns once, of the refusal, when the runtime refuses the ladder with a level asked", async () => {
    // Arrange
    const { deps, log } = effortSetup({ stored: "high", answer: REFUSAL });

    // Act
    await routeAgent(deps, THINKING_TASK, "large");

    // Assert
    deepStrictEqual(log.lines, LADDER_REFUSED_LINES);
  });

  it("asks once, and warns once, when a refusal that names no part comes with a level asked", async () => {
    // Arrange
    const { deps, picker, log } = effortSetup({ stored: "high", answer: UNNAMED_REFUSAL });

    // Act
    await routeAgent(deps, THINKING_TASK, "large");

    // Assert
    deepStrictEqual([picker.asked.length, log.lines], [1, UNNAMED_REFUSED_LINES]);
  });

  it("asks once when the runtime refuses the level part of a pick that asked no level", async () => {
    // Arrange
    const { deps, picker } = answeredSetup({ answer: EFFORT_REFUSAL });

    // Act
    await routeAgent(deps, THINKING_TASK, "large");

    // Assert
    strictEqual(picker.asked.length, 1);
  });

  it("asks nothing more when the runtime refuses a pick with no level asked", async () => {
    // Arrange
    const { deps, picker } = answeredSetup({ answer: REFUSAL });

    // Act
    await routeAgent(deps, THINKING_TASK, "large");

    // Assert
    strictEqual(picker.asked.length, 1);
  });
});

describe("routeAgent, a stored ladder that is no ladder", () => {
  for (const c of MISREAD_LADDERS) {
    it(c.name, async () => {
      // Arrange
      const { deps, log } = routeSetup("on", { ladder: c.ladder });

      // Act
      await routeAgent(deps, TASK, "large");

      // Assert
      deepStrictEqual(log.lines, c.lines);
    });
  }
});

describe("routeAgent, a stored ladder that is no ladder and nothing asked", () => {
  for (const c of MISREAD_UNASKED_CASES) {
    it(c.name, async () => {
      // Arrange
      const { deps, decision, log } = routeSetup(c.setting, { ladder: "small" });
      decision.present = c.present;

      // Act
      await routeAgent(deps, TASK, "large");

      // Assert
      deepStrictEqual(log.lines, c.lines);
    });
  }

  it("says both that the ladder is no ladder and that the session's profile is off the ladder used", async () => {
    // Arrange
    const { deps, log } = routeSetup("on", { ladder: "small" });

    // Act
    await routeAgent(deps, TASK, "guarded");

    // Assert
    deepStrictEqual(log.lines, MISREAD_AND_OUTSIDE_LINES);
  });
});

describe("actRoute, the acts of one crew run", () => {
  it("warns of a ladder that is no ladder at the first act of the run alone", async () => {
    // Arrange
    const { deps, log } = routeSetup("on", { ladder: "small" });
    const route = actRoute(deps, { session: "large", crew: "large" });
    await route(REVIEW_TASK);

    // Act
    await route(REVIEW_TASK);

    // Assert
    deepStrictEqual(log.lines, MISREAD_TWO_ACTS_LINES);
  });

  it("asks the act after a refused level for its profile alone, in one pick", async () => {
    // Arrange
    const { deps, picker } = levelRefusedSetup();
    const route = actRoute(deps, { session: "large", crew: "large" });
    await route(REVIEW_TASK);

    // Act
    await route(REVIEW_TASK);

    // Assert
    deepStrictEqual(picker.asked.map((asked) => asked.effort), [{ max: "low" }, undefined, undefined]);
  });

  it("warns of a refused level at the first act of the run alone", async () => {
    // Arrange
    const { deps, log } = levelRefusedSetup();
    const route = actRoute(deps, { session: "large", crew: "large" });
    await route(REVIEW_TASK);

    // Act
    await route(REVIEW_TASK);

    // Assert
    deepStrictEqual(log.lines, LEVEL_REFUSED_TWO_ACTS_LINES);
  });

  it("warns again at the next launch: a launch is a run of its own", async () => {
    // Arrange
    const { deps, log } = routeSetup("on", { ladder: "small" });
    await routeAgent(deps, TASK, "large");

    // Act
    await routeAgent(deps, TASK, "large");

    // Assert
    deepStrictEqual(log.lines, MISREAD_TWO_LAUNCHES_LINES);
  });
});
