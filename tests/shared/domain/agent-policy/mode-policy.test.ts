// The permission-mode policy table: one row per mode, read-only and tool classes
// consistent with each other, unknown modes degrading to `default`.
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";
import { MODE_POLICIES, policyFor } from "../../../../src/shared/domain/agent-policy/mode-policy.ts";
import { PERMISSION_MODES } from "../../../../src/shared/domain/permission-modes.ts";
import { CLASS_ORDER, READ_ONLY_CLASSES, READ_ONLY_POLICY_CASES, UNKNOWN_MODES, WRITING_CLASSES } from "./mode-policy.fixtures.ts";

describe("MODE_POLICIES", () => {
  it("has one row per permission mode, and no other", () => {
    // Arrange
    const expected = [...PERMISSION_MODES].sort();

    // Act
    const modes = Object.keys(MODE_POLICIES).sort();

    // Assert
    deepStrictEqual(modes, expected);
  });

  it("marks plan and dontAsk read-only, and only them", () => {
    // Arrange
    const modes = PERMISSION_MODES;

    // Act
    const readOnly = modes.filter((m) => MODE_POLICIES[m].readOnly);

    // Assert
    deepStrictEqual(readOnly, ["plan", "dontAsk"]);
  });

  for (const mode of PERMISSION_MODES) {
    it(`gives ${mode} read classes alone when it is read-only, and more when it is not`, () => {
      // Arrange
      const policy = MODE_POLICIES[mode];

      // Act
      const { readOnly, toolClasses } = policy;

      // Assert
      strictEqual(readOnly, toolClasses.every((c) => READ_ONLY_CLASSES.includes(c)), mode);
    });
  }

  for (const mode of PERMISSION_MODES) {
    it(`grants the read class to ${mode} and lists its classes once, in catalogue order`, () => {
      // Arrange
      const policy = MODE_POLICIES[mode];

      // Act
      const classes = policy.toolClasses;

      // Assert
      strictEqual(classes[0], "read", mode);
      deepStrictEqual([...classes], CLASS_ORDER.filter((c) => classes.includes(c)), mode);
    });
  }

  for (const mode of PERMISSION_MODES.filter((m) => !MODE_POLICIES[m].readOnly)) {
    it(`offers every class to the writing mode ${mode}, acceptEdits included: the host gate asks`, () => {
      // Arrange
      const policy = MODE_POLICIES[mode];

      // Act
      const classes = [...policy.toolClasses];

      // Assert
      deepStrictEqual(classes, [...WRITING_CLASSES], mode);
    });
  }

});

describe("policyFor", () => {
  for (const c of READ_ONLY_POLICY_CASES) {
    it(`gives ${c.mode} the classes ${c.classes.join(", ")}: ${c.why}`, () => {
      // Arrange
      const { mode } = c;

      // Act
      const policy = policyFor(mode);

      // Assert
      deepStrictEqual([...policy.toolClasses], [...c.classes], mode);
    });
  }

  for (const mode of PERMISSION_MODES) {
    it(`returns the row of the known mode ${mode}`, () => {
      // Arrange
      const expected = MODE_POLICIES[mode];

      // Act
      const policy = policyFor(mode);

      // Assert
      strictEqual(policy, expected, mode);
    });
  }

  for (const mode of UNKNOWN_MODES) {
    it(`gives the unknown mode ${JSON.stringify(mode)} the default policy (case-sensitive, no prototype keys)`, () => {
      // Arrange
      const expected = MODE_POLICIES.default;

      // Act
      const policy = policyFor(mode);

      // Assert
      strictEqual(policy, expected, JSON.stringify(mode));
    });
  }
});
