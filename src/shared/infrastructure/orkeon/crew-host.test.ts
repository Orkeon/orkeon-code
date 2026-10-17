// The CrewHost adapter over a FakeScriptHost served by a FakeServiceLocator. Run:
//   node_modules/.bin/tsx --test shared/infrastructure/orkeon/crew-host.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual, throws } from "node:assert";

import { createCrewHost } from "./crew-host.ts";
import { FakeScriptHost, FakeServiceLocator } from "../../../../tests/support/fake-script-host.ts";

function setup() {
  const host = new FakeScriptHost();
  const services = new FakeServiceLocator();
  services.services.set("script-host", host);
  return { host, services, crews: createCrewHost(services) };
}

describe("createCrewHost — listing", () => {
  it("lists the crews the host discovered", () => {
    const { host, crews } = setup();
    host.crews = ["main-loop", "git-commit"];
    deepStrictEqual(crews.listCrews(), ["main-loop", "git-commit"]);
  });

  it("lists nothing when the host has no script-host, or its listing throws", () => {
    deepStrictEqual(createCrewHost(new FakeServiceLocator()).listCrews(), []);
    const { host, crews } = setup();
    host.listFailure = new Error("crews dir unreadable");
    deepStrictEqual(crews.listCrews(), []);
  });
});

describe("createCrewHost — launching", () => {
  it("starts the crew with its input and returns the ticket", () => {
    const { host, crews } = setup();
    strictEqual(crews.launch("git-commit", { permissionMode: "acceptEdits" }), "ticket-1");
    deepStrictEqual(host.launches, [{ name: "git-commit", input: { permissionMode: "acceptEdits" } }]);
  });

  it("throws when the host cannot run crews", () => {
    throws(() => createCrewHost(new FakeServiceLocator()).launch("main-loop", {}));
  });
});
