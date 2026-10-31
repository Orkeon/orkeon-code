// The RuntimeInfoReader adapter over a FakeRuntimeService served by a FakeServiceLocator (Orkeon #225). Run:
//   node --test tests/shared/infrastructure/orkeon/runtime-info.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { createRuntimeInfo } from "../../../../src/shared/infrastructure/orkeon/runtime-info.ts";
import { FakeServiceLocator } from "../../../support/doubles/fake-script-host.ts";
import { runtimeOverFake } from "./runtime-info.fixtures.ts";

describe("createRuntimeInfo", () => {
  it("answers nothing on a host without the runtime service", () => {
    // Arrange
    const reader = createRuntimeInfo(new FakeServiceLocator());

    // Act
    const info = reader.read();

    // Assert
    strictEqual(info, undefined);
  });

  it("reads the version, the commit and the channel from the service", () => {
    // Arrange
    const { reader } = runtimeOverFake();

    // Act
    const info = reader.read();

    // Assert
    deepStrictEqual(info, { version: "1.0.0-rc.6", commit: "d6fd816", channel: "source" });
  });

  it("keeps a null commit as null", () => {
    // Arrange
    const { service, reader } = runtimeOverFake();
    service.commit = null;

    // Act
    const info = reader.read();

    // Assert
    strictEqual(info?.commit, null);
  });

  it("names the channel unknown when the host leaves it blank", () => {
    // Arrange
    const { service, reader } = runtimeOverFake();
    service.channel = " ";

    // Act
    const info = reader.read();

    // Assert
    strictEqual(info?.channel, "unknown");
  });

  it("answers nothing on a service without a version", () => {
    // Arrange
    const { service, reader } = runtimeOverFake();
    service.version = "";

    // Act
    const info = reader.read();

    // Assert
    strictEqual(info, undefined);
  });
});
