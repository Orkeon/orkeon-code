// The RunningCrews adapter over a FakeCommandsService served by a FakeServiceLocator: the running instances whose
// intent is the crew's name, and nothing on a host without the commands service. Run:
//   node --test tests/shared/infrastructure/orkeon/running-crews.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual } from "node:assert";

import { createRunningCrews } from "../../../../src/shared/infrastructure/orkeon/running-crews.ts";
import { FakeServiceLocator } from "../../../support/doubles/fake-script-host.ts";
import { HOST_INSTANCES, RUNNING_CASES, commandsOverFake } from "./running-crews.fixtures.ts";

describe("createRunningCrews", () => {
  it("answers no instance on a host without the commands service", () => {
    // Arrange
    const running = createRunningCrews(new FakeServiceLocator());

    // Act
    const instances = running.running("code-review");

    // Assert
    deepStrictEqual(instances, []);
  });

  for (const c of RUNNING_CASES) {
    it(c.name, () => {
      // Arrange
      const { service, running } = commandsOverFake();
      service.instances = HOST_INSTANCES;

      // Act
      const instances = running.running(c.crew);

      // Assert
      deepStrictEqual(instances, c.expected);
    });
  }

  it("asks the host for the running instances only", () => {
    // Arrange
    const { service, running } = commandsOverFake();
    service.instances = HOST_INSTANCES;

    // Act
    running.running("code-review");

    // Assert
    deepStrictEqual(service.filters, [{ state: "running" }]);
  });
});
