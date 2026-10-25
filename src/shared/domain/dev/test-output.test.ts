import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";
import { failedTests } from "./test-output.ts";
import { GREEN_TAP_RUN, OTHER_FORMATS, TAP_RUN, tapRunFailing, tapRunWithLongName } from "./test-output.fixtures.ts";

describe("failedTests", () => {
  it("names the failed tests of a TAP run once each, their directives dropped", () => {
    // Arrange
    const output = TAP_RUN;

    // Act
    const failed = failedTests(output);

    // Assert
    deepStrictEqual(failed, ["averages a list", "refuses the mean of an empty list"]);
  });

  for (const sample of OTHER_FORMATS) {
    it(`reads the failed tests of a ${sample.format} run, and nothing from its chatter`, () => {
      // Arrange
      const { output } = sample;

      // Act
      const failed = failedTests(output);

      // Assert
      deepStrictEqual(failed, sample.failed);
    });
  }

  it("stops at 20 failed tests", () => {
    // Arrange
    const output = tapRunFailing(30);

    // Act
    const failed = failedTests(output);

    // Assert
    strictEqual(failed.length, 20);
  });

  it("cuts a name at 120 characters", () => {
    // Arrange
    const output = tapRunWithLongName(200);

    // Act
    const [name] = failedTests(output);

    // Assert
    strictEqual(name.length, 120);
  });

  it("lists no failed test for a green run", () => {
    // Arrange
    const output = GREEN_TAP_RUN;

    // Act
    const failed = failedTests(output);

    // Assert
    deepStrictEqual(failed, []);
  });
});
