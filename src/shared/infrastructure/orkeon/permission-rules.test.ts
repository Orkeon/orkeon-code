// The PermissionRules adapter over a FakePermissionRulesFacade served by a
// FakeServiceLocator. Run:
//   node --test src/shared/infrastructure/orkeon/permission-rules.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual, throws } from "node:assert";

import { createPermissionRules } from "./permission-rules.ts";
import { FakePermissionRulesFacade } from "../../../../tests/support/fake-permissions-facade.ts";
import { FakeServiceLocator } from "../../../../tests/support/fake-script-host.ts";

function setup() {
  const facade = new FakePermissionRulesFacade();
  const services = new FakeServiceLocator();
  services.services.set("permissions", facade);
  return { facade, gate: createPermissionRules(services) };
}

describe("createPermissionRules", () => {
  it("is available when the host serves the permissions service, and only then", () => {
    strictEqual(setup().gate.available(), true);
    strictEqual(createPermissionRules(new FakeServiceLocator()).available(), false);
  });

  it("reports the gate as the host says it, and undefined when the host cannot say", () => {
    const { facade, gate } = setup();
    strictEqual(gate.enabled(), true);
    facade.enabled = false;
    strictEqual(gate.enabled(), false);
    // A host without the permissions service.
    strictEqual(createPermissionRules(new FakeServiceLocator()).enabled(), undefined);
  });

  it("passes a whole-tool rule as the tool alone, and a scoped rule with its argument and pattern", () => {
    const { facade, gate } = setup();
    gate.add({ effect: "deny", tool: "file_write" });
    gate.add({ effect: "allow", tool: "http_api" });
    gate.add({ effect: "allow", tool: "shell_command", argument: "command", pattern: "npm test*" });
    gate.add({ effect: "deny", tool: "shell_command", argument: "command", pattern: "git push*" });
    deepStrictEqual(facade.calls, [
      ["deny", "file_write"],
      ["allow", "http_api"],
      ["allow", "shell_command", "command", "npm test*"],
      ["deny", "shell_command", "command", "git push*"],
    ]);
  });

  it("clears the host's rules and lists them as the host spells them", () => {
    const { facade, gate } = setup();
    facade.lines = ["allow shell_command command=npm test*"];
    gate.clear();
    deepStrictEqual(facade.calls, [["clear"]]);
    deepStrictEqual(gate.list(), ["allow shell_command command=npm test*"]);
  });

  it("throws when the host keeps no rules", () => {
    const gate = createPermissionRules({
      has: () => false,
      get: () => {
        throw new Error("service 'permissions' is not registered");
      },
    });
    throws(() => gate.clear(), /not registered/);
    throws(() => gate.add({ effect: "deny", tool: "file_write" }), /not registered/);
  });
});
