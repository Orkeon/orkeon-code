// The UsageReader adapter over a FakeUsageService served by a FakeServiceLocator (Orkeon #226). Run:
//   node --test tests/shared/infrastructure/orkeon/usage.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { createUsageReader } from "../../../../src/shared/infrastructure/orkeon/usage.ts";
import { FakeServiceLocator } from "../../../support/doubles/fake-script-host.ts";
import { HOST_REPORT, PASCAL_REPORT, PORT_REPORT, usageOverFake } from "./usage.fixtures.ts";

describe("createUsageReader", () => {
  it("answers nothing on a host without the usage service", () => {
    // Arrange
    const reader = createUsageReader(new FakeServiceLocator());

    // Act
    const report = reader.report();

    // Assert
    strictEqual(report, undefined);
  });

  it("reads the totals, the models and the commands, field by field", () => {
    // Arrange
    const { service, reader } = usageOverFake();
    service.answer = HOST_REPORT;

    // Act
    const report = reader.report();

    // Assert
    deepStrictEqual(report, PORT_REPORT);
  });

  it("reads a PascalCase report with its counts as numbers and an unpriced cost as null", () => {
    // Arrange
    const { service, reader } = usageOverFake();
    service.answer = PASCAL_REPORT as any;

    // Act
    const report = reader.report();

    // Assert
    deepStrictEqual(
      [report?.totalTokens, report?.unpricedCalls, report?.cost, report?.byModel[0]?.model, report?.byModel[0]?.promptTokens, report?.byCommand],
      [12, 1, null, "kimi", 10, []],
    );
  });

  it("keeps the cache and reasoning counts the host left unreported as null", () => {
    // Arrange
    const { service, reader } = usageOverFake();
    service.answer = PASCAL_REPORT as any;

    // Act
    const report = reader.report();

    // Assert
    deepStrictEqual(
      [report?.cacheHitTokens, report?.byModel[0]?.cacheHitTokens, report?.byModel[0]?.cacheWriteTokens, report?.byModel[0]?.reasoningTokens],
      [0, null, null, null],
    );
  });

  it("answers nothing when the service throws", () => {
    // Arrange
    const { service, reader } = usageOverFake();
    service.report = () => { throw new Error("no cost manager"); };

    // Act
    const report = reader.report();

    // Assert
    strictEqual(report, undefined);
  });
});
