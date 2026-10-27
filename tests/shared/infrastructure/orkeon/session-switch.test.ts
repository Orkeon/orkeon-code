// The SessionSwitch adapter over a FakeSessionService served by a FakeServiceLocator (Orkeon #227). Run:
//   node --test tests/shared/infrastructure/orkeon/session-switch.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { createSessionSwitch } from "../../../../src/shared/infrastructure/orkeon/session-switch.ts";
import { FakeServiceLocator } from "../../../support/doubles/fake-script-host.ts";
import { switchOverFake } from "./session-switch.fixtures.ts";

describe("createSessionSwitch", () => {
  it("hands out nothing on a host without the session service", () => {
    // Arrange
    const services = new FakeServiceLocator();

    // Act
    const sw = createSessionSwitch(services);

    // Assert
    strictEqual(sw, undefined);
  });

  it("saves to the session's own file without a path, and answers that path", async () => {
    // Arrange
    const { service, sw } = switchOverFake();

    // Act
    const path = await sw.save();

    // Assert
    deepStrictEqual([path, service.saves], [service.own, [undefined]]);
  });

  it("saves to the path given", async () => {
    // Arrange
    const { service, sw } = switchOverFake();

    // Act
    const path = await sw.save("/sessions/proj-1a2b3c/archived.json");

    // Assert
    deepStrictEqual([path, service.saves], ["/sessions/proj-1a2b3c/archived.json", ["/sessions/proj-1a2b3c/archived.json"]]);
  });

  it("loads the file given and answers the messages loaded as a number", async () => {
    // Arrange
    const { service, sw } = switchOverFake();
    service.loaded = 7;

    // Act
    const count = await sw.load("/session-history/20261027T100000Z-abc.json");

    // Assert
    deepStrictEqual([count, service.loads], [7, ["/session-history/20261027T100000Z-abc.json"]]);
  });
});
