// scripts/smoke-validate.sh over a fake runner (SMOKE_VALIDATE_RUNNER): each case scripts how the
// runner ends and what it prints. No orkeon, no network. Run:
//   node --test tests/scripts/smoke-validate.test.ts
import { describe, it } from "node:test";
import { spawnSync } from "node:child_process";
import { strictEqual } from "node:assert";
import {
  CREWS,
  EXITS,
  FAILED_LINE,
  OK_LINE,
  run,
  SCRIPT,
  SKIPPED_LINE,
  SKIPPED_REPORT,
} from "./smoke-validate.fixtures.ts";
import {
  assertEveryCrew,
  assertExit,
  assertKeylessSettings,
  assertReports,
  assertOnTheDemo,
  assertValidateOnly,
} from "./smoke-validate.assertions.ts";

describe("scripts/smoke-validate.sh", () => {
  it("parses as bash", () => {
    // Arrange
    const script = SCRIPT;

    // Act
    const r = spawnSync("bash", ["-n", script]);

    // Assert
    strictEqual(r.status, 0);
  });

  for (const c of EXITS) {
    it(c.name, () => {
      // Arrange
      const plan = c.plan;

      // Act
      const r = run(plan);

      // Assert
      assertExit(r, c);
    });
  }

  it("validates every crew of src/crews, the probes left out", () => {
    // Arrange
    const plan = `0|${OK_LINE}`;

    // Act
    const r = run(plan);

    // Assert
    assertEveryCrew(r, CREWS);
  });

  it("asks the runner for a dry run and brings no model answers", () => {
    // Arrange
    const plan = `0|${OK_LINE}`;

    // Act
    const r = run(plan);

    // Assert
    assertValidateOnly(r);
  });

  it("validates each crew on the demo fixture", () => {
    // Arrange
    const plan = `0|${OK_LINE}`;

    // Act
    const r = run(plan);

    // Assert
    assertOnTheDemo(r);
  });

  it("gives the runner the example settings made keyless", () => {
    // Arrange
    const plan = `0|${OK_LINE}`;

    // Act
    const r = run(plan);

    // Assert
    assertKeylessSettings(r);
  });

  it("names the crew that failed and the runtime's verdict", () => {
    // Arrange
    const plan = `1|${FAILED_LINE}`;

    // Act
    const r = run(plan);

    // Assert
    assertReports(r, `smoke-validate: FAIL git-commit (exit 1): ${FAILED_LINE}`);
  });

  it("names the setting that hands the runtime a compiler when the type check was skipped", () => {
    // Arrange
    const plan = `0|${SKIPPED_LINE}\\n${OK_LINE}`;

    // Act
    const r = run(plan);

    // Assert
    assertReports(r, SKIPPED_REPORT);
  });

  it("counts the crews judged and the failures", () => {
    // Arrange
    const plan = "0|";

    // Act
    const r = run(plan);

    // Assert
    assertReports(r, `smoke-validate: ${CREWS.length} crews, ${CREWS.length} failed`);
  });
});
