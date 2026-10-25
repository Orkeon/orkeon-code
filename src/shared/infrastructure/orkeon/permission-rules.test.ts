// The PermissionRules adapter over a FakePermissionRulesFacade served by a
// FakeServiceLocator. Run:
//   node --test src/shared/infrastructure/orkeon/permission-rules.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual, throws } from "node:assert";

import { createPermissionRules } from "./permission-rules.ts";
import { FakeServiceLocator } from "../../../../tests/support/fake-script-host.ts";
import { CHANGES_WITHOUT_RULES, RULES, gateOverFake, gateWithoutRules } from "./permission-rules.fixtures.ts";

describe("createPermissionRules", () => {
  it("is available when the host serves the permissions service", () => {
    // Arrange
    const { gate } = gateOverFake();

    // Act
    const available = gate.available();

    // Assert
    strictEqual(available, true);
  });

  it("is not available when the host does not serve the permissions service", () => {
    // Arrange
    const gate = createPermissionRules(new FakeServiceLocator());

    // Act
    const available = gate.available();

    // Assert
    strictEqual(available, false);
  });

  it("reports the gate enabled as the host says it", () => {
    // Arrange
    const { gate } = gateOverFake();

    // Act
    const enabled = gate.enabled();

    // Assert
    strictEqual(enabled, true);
  });

  it("reports the gate disabled as the host says it", () => {
    // Arrange
    const { facade, gate } = gateOverFake();
    facade.enabled = false;

    // Act
    const enabled = gate.enabled();

    // Assert
    strictEqual(enabled, false);
  });

  it("reports the gate as undefined when the host has no permissions service", () => {
    // Arrange
    const gate = createPermissionRules(new FakeServiceLocator());

    // Act
    const enabled = gate.enabled();

    // Assert
    strictEqual(enabled, undefined);
  });

  for (const c of RULES) {
    it(c.name, () => {
      // Arrange
      const { facade, gate } = gateOverFake();

      // Act
      gate.add(c.rule);

      // Assert
      deepStrictEqual(facade.calls, [c.call]);
    });
  }

  it("clears the host's rules", () => {
    // Arrange
    const { facade, gate } = gateOverFake();

    // Act
    gate.clear();

    // Assert
    deepStrictEqual(facade.calls, [["clear"]]);
  });

  it("lists the rules as the host spells them", () => {
    // Arrange
    const { facade, gate } = gateOverFake();
    facade.lines = ["allow shell_command command=npm test*"];

    // Act
    const lines = gate.list();

    // Assert
    deepStrictEqual(lines, ["allow shell_command command=npm test*"]);
  });

  for (const c of CHANGES_WITHOUT_RULES) {
    it(c.name, () => {
      // Arrange
      const gate = gateWithoutRules();

      // Act
      const act = () => c.change(gate);

      // Assert
      throws(act, /not registered/);
    });
  }
});
