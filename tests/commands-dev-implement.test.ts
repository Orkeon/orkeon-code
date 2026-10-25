// /dev-implement's arguments and its chain in `completed` (src/commands/_lib/dev-implement.ts). Run:
//   node --test tests/commands-dev-implement.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { chainStep, DEV_IMPLEMENT_USAGE, parseDevImplementArgs } from "../src/commands/_lib/dev-implement.ts";
import { writeModeRefusal } from "../src/commands/_lib/dev-step.ts";
import {
  AUDIT_PAYLOAD,
  CORRECTION_CASES,
  GAPS_TEXT,
  NO_CLOSE_CASES,
  QUOTED_VALID,
  READ_CASES,
  REFUSED_CASES,
  REFUSED_MODES,
  VALID_TEXT,
  WRITES,
  WRITING_MODES,
} from "./commands-dev-implement.fixtures.ts";

describe("parseDevImplementArgs", () => {
  for (const c of READ_CASES) {
    it(`reads the batch, the plan and the close: ${c.name}`, () => {
      // Arrange
      const { tokens, args } = c;

      // Act
      const parsed = parseDevImplementArgs(tokens);

      // Assert
      deepStrictEqual(parsed, { ok: true, args });
    });
  }

  it("refuses no batch with the usage", () => {
    // Arrange
    const tokens: string[] = [];

    // Act
    const parsed = parseDevImplementArgs(tokens);

    // Assert
    deepStrictEqual(parsed, { ok: false, text: DEV_IMPLEMENT_USAGE });
  });

  for (const c of REFUSED_CASES) {
    it(`refuses ${c.name}`, () => {
      // Arrange
      const { tokens } = c;

      // Act
      const parsed = parseDevImplementArgs(tokens);

      // Assert
      strictEqual(parsed.ok, false);
    });
  }

  for (const c of CORRECTION_CASES) {
    it(`reads a correction's finding, after the dash or the word alone, the plan before it: ${c.name}`, () => {
      // Arrange
      const { tokens, args } = c;

      // Act
      const parsed = parseDevImplementArgs(tokens);

      // Assert
      deepStrictEqual(parsed, { ok: true, args });
    });
  }

  it("refuses a correction without its finding", () => {
    // Arrange
    const tokens = ["F1", "—", "correction:"];

    // Act
    const parsed = parseDevImplementArgs(tokens);

    // Assert
    ok(!parsed.ok && parsed.text.includes("names its finding"), JSON.stringify(parsed));
  });

  it("refuses a correction with --close", () => {
    // Arrange
    const tokens = ["F1", "--close", "—", "correction:", "x"];

    // Act
    const parsed = parseDevImplementArgs(tokens);

    // Assert
    strictEqual(parsed.ok, false);
  });
});

describe("chainStep", () => {
  it("prints the crew's lines and launches the audit it names", () => {
    // Arrange
    const payload = AUDIT_PAYLOAD;

    // Act
    const step = chainStep(payload);

    // Assert
    deepStrictEqual(step, { lines: ["a", "b"], launch: { crew: "dev-verify", input: { batch: "F1", plan: "demo" }, instead: "/dev-verify F1 demo" } });
  });

  it("prints the crew's lines and launches nothing when it names no next crew", () => {
    // Arrange
    const payload = JSON.stringify({ lines: ["BLOCKED — x"] });

    // Act
    const step = chainStep(payload);

    // Assert
    deepStrictEqual(step, { lines: ["BLOCKED — x"] });
  });

  it("carries the input the crew wrote to the audit: its mode, the hooks, the effort", () => {
    // Arrange
    const input = { batch: "F1", plan: "demo", mode: "resume", hooks: [{ event: "pre" }], effort: "high" };
    const payload = JSON.stringify({ lines: [], next: { crew: "dev-verify", input } });

    // Act
    const step = chainStep(payload);

    // Assert
    deepStrictEqual(step.launch, { crew: "dev-verify", input, instead: "/dev-verify F1 demo resume" });
  });

  it("launches the close on the audit's VALID line, its plan read off the verdict file", () => {
    // Arrange
    const text = VALID_TEXT;

    // Act
    const step = chainStep(text);

    // Assert
    deepStrictEqual(step.launch, {
      crew: "dev-implement", input: { batch: "F1", plan: "workbench/demo/DEMO-PLAN.md", close: true },
      instead: "/dev-implement F1 workbench/demo/DEMO-PLAN.md --close",
    });
  });

  it("launches no close on a VALID line quoted inside a gap, and prints the text as is", () => {
    // Arrange
    const text = QUOTED_VALID;

    // Act
    const step = chainStep(text);

    // Assert
    deepStrictEqual(step, { lines: text.split("\n") });
  });

  for (const c of NO_CLOSE_CASES) {
    it(`launches no close on ${c.name}`, () => {
      // Arrange
      const { text } = c;

      // Act
      const step = chainStep(text);

      // Assert
      strictEqual(step.launch, undefined);
    });
  }

  it("launches nothing on GAPS, and prints the audit's text as is", () => {
    // Arrange
    const text = GAPS_TEXT;

    // Act
    const step = chainStep(text);

    // Assert
    deepStrictEqual(step, { lines: text.split("\n") });
  });
});

describe("writeModeRefusal, for /dev-implement and /dev-batches", () => {
  for (const c of REFUSED_MODES) {
    it(`refuses ${c.name}`, () => {
      // Arrange
      const { mode, command } = c;

      // Act
      const refusal = writeModeRefusal(mode, command, WRITES);

      // Assert
      strictEqual(refusal, c.refusal);
    });
  }

  for (const c of WRITING_MODES) {
    it(`lets the writing mode ${c.mode} run /${c.command}`, () => {
      // Arrange
      const { mode, command } = c;

      // Act
      const refusal = writeModeRefusal(mode, command, WRITES);

      // Assert
      strictEqual(refusal, null);
    });
  }
});
