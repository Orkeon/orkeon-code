// /route over fakes. Run:
//   node --test tests/commands/_lib/settings/route.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { runRoute } from "../../../../src/commands/_lib/settings/route.ts";
import {
  CUSTOM_LADDER, RECENT, SET_OFF, STATUS_CUSTOM_WITH_HIGH, SET_ON, SET_ON_NO_MODEL, STATUS_OFF, STATUS_ON_NO_MODEL, STATUS_WITH_MEDIUM, STATUS_WITH_RUNGS,
  WHY_LINES, routeCommandSetup, routeOnGlmSetup,
} from "./route.fixtures.ts";
import { EFFORT_STATE_KEY } from "../../../../src/shared/domain/session-keys.ts";

describe("runRoute", () => {
  it("says where the routing stands when bare", async () => {
    // Arrange
    const { deps } = routeCommandSetup();

    // Act
    const view = await runRoute([], deps);

    // Assert
    strictEqual(view.text, STATUS_OFF);
  });

  it("says the ladder set, and that nothing is routed without a decision model", async () => {
    // Arrange
    const { deps, config, decision } = routeCommandSetup();
    config.values = { "route.agents": "on", "route.ladder": "fast,strong" };
    decision.present = false;

    // Act
    const view = await runRoute([], deps);

    // Assert
    strictEqual(view.text, STATUS_ON_NO_MODEL);
  });

  it("turns the routing on for the session, the other session settings kept", async () => {
    // Arrange
    const { deps, config } = routeCommandSetup();
    config.session = { "voice.reply": "on" };

    // Act
    const view = await runRoute(["ON"], deps);

    // Assert
    deepStrictEqual([view.text, config.session], [SET_ON, { "voice.reply": "on", "route.agents": "on" }]);
  });

  it("warns when turned on without a decision model", async () => {
    // Arrange
    const { deps, decision } = routeCommandSetup();
    decision.present = false;

    // Act
    const view = await runRoute(["on"], deps);

    // Assert
    strictEqual(view.text, SET_ON_NO_MODEL);
  });

  it("turns the routing off for the session", async () => {
    // Arrange
    const { deps, config } = routeCommandSetup();
    config.session = { "route.agents": "on" };

    // Act
    const view = await runRoute(["off"], deps);

    // Assert
    deepStrictEqual([view.text, config.session], [SET_OFF, { "route.agents": "off" }]);
  });

  it("shows the last routed launches with why", async () => {
    // Arrange
    const { deps, session } = routeCommandSetup();
    session.state.set("route_recent", RECENT);

    // Act
    const view = await runRoute(["why"], deps);

    // Assert
    deepStrictEqual(view.lines, WHY_LINES);
  });

  it("says nothing was routed yet", async () => {
    // Arrange
    const { deps } = routeCommandSetup();

    // Act
    const view = await runRoute(["why"], deps);

    // Assert
    strictEqual(view.text, "nothing routed yet in this session.");
  });

  it("answers its usage for another word", async () => {
    // Arrange
    const { deps } = routeCommandSetup();

    // Act
    const view = await runRoute(["maybe"], deps);

    // Assert
    strictEqual(view.text, "usage: /route [on|off|why]");
  });
});

describe("runRoute — what each rung's model takes", () => {
  it("lists under the status the levels each rung's model takes", async () => {
    // Arrange
    const { deps } = routeOnGlmSetup();

    // Act
    const view = await runRoute([], deps);

    // Assert
    strictEqual(view.text, STATUS_WITH_RUNGS);
  });

  it("says what the stored effort is sent as on a rung whose model does not take it", async () => {
    // Arrange
    const { deps, session } = routeOnGlmSetup();
    session.state.set(EFFORT_STATE_KEY, "medium");

    // Act
    const view = await runRoute([], deps);

    // Assert
    strictEqual(view.text, STATUS_WITH_MEDIUM);
  });

  it("leaves out a rung the runtime cannot tell about", async () => {
    // Arrange
    const { deps, config } = routeOnGlmSetup();
    config.values = { "route.ladder": "ghost,large" };

    // Act
    const view = await runRoute([], deps);

    // Assert
    strictEqual(view.text, "route.agents: off; ladder: ghost,large (cheapest first); decision model: present.\n  large: glm-5.3 takes low, high, max");
  });

  it("leaves out a rung on a model the capability table does not know", async () => {
    // Arrange
    const { deps, config } = routeOnGlmSetup();
    config.values = CUSTOM_LADDER;

    // Act
    const view = await runRoute([], deps);

    // Assert
    strictEqual(view.text, STATUS_CUSTOM_WITH_HIGH);
  });

  it("says nothing of a stored level sent unchecked on a rung the capability table does not know", async () => {
    // Arrange
    const { deps, config, session } = routeOnGlmSetup();
    config.values = CUSTOM_LADDER;
    session.state.set(EFFORT_STATE_KEY, "high");

    // Act
    const view = await runRoute([], deps);

    // Assert
    strictEqual(view.text, STATUS_CUSTOM_WITH_HIGH);
  });
});
