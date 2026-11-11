// /route over fakes. Run:
//   node --test tests/commands/_lib/settings/route.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { runRoute } from "../../../../src/commands/_lib/settings/route.ts";
import {
  RECENT, SET_OFF, SET_ON, SET_ON_NO_MODEL, STATUS_OFF, STATUS_ON_NO_MODEL, WHY_LINES, routeCommandSetup,
} from "./route.fixtures.ts";

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
