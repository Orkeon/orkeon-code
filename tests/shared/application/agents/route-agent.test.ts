// The profile a crew is launched on, over fakes. Run:
//   node --test tests/shared/application/agents/route-agent.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { routeAgent } from "../../../../src/shared/application/agents/route-agent.ts";
import {
  BILLING_RULES, BILLING_TASK, NO_ANSWER_LINE, NO_MODEL_WARNING, OUTSIDE_LADDER_LINE, ROUTED_SMALL_LINE, RULES_PATH, SMALL_RECORD,
  TASK, pick, routeSetup,
} from "./route-agent.fixtures.ts";

describe("routeAgent", () => {
  for (const setting of ["off", null]) {
    it(`keeps the session's profile and asks nothing when route.agents is ${setting ?? "unset"}`, async () => {
      // Arrange
      const { deps, decision } = routeSetup(setting);

      // Act
      const profile = await routeAgent(deps, TASK, "large");

      // Assert
      deepStrictEqual([profile, decision.asked.length], ["large", 0]);
    });
  }

  it("keeps the session's profile and says why when the host has no decision model", async () => {
    // Arrange
    const { deps, decision, log } = routeSetup();
    decision.present = false;

    // Act
    const profile = await routeAgent(deps, TASK, "large");

    // Assert
    deepStrictEqual([profile, log.lines], ["large", [NO_MODEL_WARNING]]);
  });

  it("keeps a session's profile that is not on the ladder, and asks nothing", async () => {
    // Arrange
    const { deps, decision, log } = routeSetup();

    // Act
    const profile = await routeAgent(deps, TASK, "guarded");

    // Assert
    deepStrictEqual([profile, decision.asked.length, log.lines], ["guarded", 0, [OUTSIDE_LADDER_LINE]]);
  });

  it("launches on the rung the decision model picks, and says so", async () => {
    // Arrange
    const { deps, log } = routeSetup();

    // Act
    const profile = await routeAgent(deps, TASK, "large");

    // Assert
    deepStrictEqual([profile, log.lines], ["small", [ROUTED_SMALL_LINE]]);
  });

  it("asks about the crew and the command, one choice among the ladder's profiles", async () => {
    // Arrange
    const { deps, decision, config } = routeSetup();
    config.values["route.ladder"] = "fast,strong";

    // Act
    await routeAgent(deps, TASK, null);

    // Assert
    deepStrictEqual(
      [String(decision.asked[0].state).endsWith("\n/dev-plan invoice-export"), Object.keys(decision.asked[0].questions.profile.criteria)],
      [true, ["fast", "strong"]],
    );
  });

  it("raises the pick to the floor of the project's rules", async () => {
    // Arrange
    const { deps, files } = routeSetup();
    files.files.set(RULES_PATH, BILLING_RULES);

    // Act
    const profile = await routeAgent(deps, BILLING_TASK, null);

    // Assert
    strictEqual(profile, "large");
  });

  it("applies no floor when the rules file cannot be read", async () => {
    // Arrange
    const { deps, files } = routeSetup();
    files.readErrors.set(RULES_PATH, new Error("access denied"));

    // Act
    const profile = await routeAgent(deps, BILLING_TASK, null);

    // Assert
    strictEqual(profile, "small");
  });

  it("keeps the host's default model when the decision model does not answer", async () => {
    // Arrange
    const { deps, decision, log } = routeSetup();
    decision.replies = [null];

    // Act
    const profile = await routeAgent(deps, TASK, null);

    // Assert
    deepStrictEqual([profile, log.lines], [null, [NO_ANSWER_LINE]]);
  });

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
    const { deps, session, decision } = routeSetup();
    decision.answers = pick("large");
    session.writeStateFailure = new Error("no session");

    // Act
    const profile = await routeAgent(deps, TASK, null);

    // Assert
    strictEqual(profile, "large");
  });
});
