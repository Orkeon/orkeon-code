// The CrewHost adapter over a FakeScriptHost served by a FakeServiceLocator. Run:
//   node --test tests/shared/infrastructure/orkeon/crew-host.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual, throws } from "node:assert";

import { createCrewHost } from "../../../../src/shared/infrastructure/orkeon/crew-host.ts";
import { FakeServiceLocator } from "../../../support/doubles/fake-script-host.ts";
import { crewHostOverFake } from "./crew-host.fixtures.ts";

describe("createCrewHost — listing", () => {
  it("lists the crews the host discovered", () => {
    // Arrange
    const { host, crews } = crewHostOverFake();
    host.crews = ["main-loop", "git-commit"];

    // Act
    const listed = crews.listCrews();

    // Assert
    deepStrictEqual(listed, ["main-loop", "git-commit"]);
  });

  it("lists nothing when the host has no script-host", () => {
    // Arrange
    const crews = createCrewHost(new FakeServiceLocator());

    // Act
    const listed = crews.listCrews();

    // Assert
    deepStrictEqual(listed, []);
  });

  it("lists nothing when the host's listing throws", () => {
    // Arrange
    const { host, crews } = crewHostOverFake();
    host.listFailure = new Error("crews dir unreadable");

    // Act
    const listed = crews.listCrews();

    // Assert
    deepStrictEqual(listed, []);
  });
});

describe("createCrewHost — launching", () => {
  it("starts the crew with its input and returns the ticket", () => {
    // Arrange
    const { host, crews } = crewHostOverFake();

    // Act
    const ticket = crews.launch("git-commit", { permissionMode: "acceptEdits" });

    // Assert
    strictEqual(ticket, "ticket-1");
    deepStrictEqual(host.launches, [{ name: "git-commit", input: { permissionMode: "acceptEdits" } }]);
  });

  it("throws when the host cannot run crews", () => {
    // Arrange
    const crews = createCrewHost(new FakeServiceLocator());

    // Act
    const act = () => crews.launch("main-loop", {});

    // Assert
    throws(act);
  });
});
