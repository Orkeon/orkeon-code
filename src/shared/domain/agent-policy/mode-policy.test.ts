// The permission-mode policy table: one row per mode, read-only and tool classes
// consistent with each other, unknown modes degrading to `default`.
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";
import { MODE_POLICIES, policyFor } from "./mode-policy.ts";
import type { ToolClass } from "./mode-policy.ts";
import { PERMISSION_MODES } from "../permission-modes.ts";

const CLASS_ORDER: readonly ToolClass[] = ["read", "network", "edit", "shell", "extra"];

describe("MODE_POLICIES", () => {
  it("has one row per permission mode, and no other", () => {
    deepStrictEqual(Object.keys(MODE_POLICIES).sort(), [...PERMISSION_MODES].sort());
  });

  it("marks plan and dontAsk read-only, and only them", () => {
    deepStrictEqual(PERMISSION_MODES.filter((m) => MODE_POLICIES[m].readOnly), ["plan", "dontAsk"]);
  });

  it("gives a read-only mode the local read class alone, and every other mode more", () => {
    for (const mode of PERMISSION_MODES) {
      const { readOnly, toolClasses } = MODE_POLICIES[mode];
      strictEqual(readOnly, toolClasses.length === 1 && toolClasses[0] === "read", mode);
    }
  });

  it("grants the read class to every mode and lists classes once, in catalogue order", () => {
    for (const mode of PERMISSION_MODES) {
      const classes = MODE_POLICIES[mode].toolClasses;
      strictEqual(classes[0], "read", mode);
      deepStrictEqual([...classes], CLASS_ORDER.filter((c) => classes.includes(c)), mode);
    }
  });

  it("offers every class to every writing mode, acceptEdits included: the host gate asks", () => {
    for (const mode of PERMISSION_MODES.filter((m) => !MODE_POLICIES[m].readOnly)) {
      deepStrictEqual([...MODE_POLICIES[mode].toolClasses], [...CLASS_ORDER], mode);
    }
  });
});

describe("policyFor", () => {
  it("returns the row of a known mode", () => {
    for (const mode of PERMISSION_MODES) strictEqual(policyFor(mode), MODE_POLICIES[mode], mode);
  });

  it("gives an unknown mode the default policy (case-sensitive, no prototype keys)", () => {
    for (const mode of ["", "yolo", "Plan", "constructor", "toString"]) {
      strictEqual(policyFor(mode), MODE_POLICIES.default, JSON.stringify(mode));
    }
  });
});
