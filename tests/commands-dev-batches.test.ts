// /dev-batches' arguments and its chain in `completed` (src/commands/_lib/dev-batches.ts): each answer
// told apart by the crew that gave it. Run:
//   node --test tests/commands-dev-batches.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import {
  DEV_BATCHES_USAGE, batchesChainStep, batchesLaunchInput, batchesModeRefusal, parseDevBatchesArgs,
} from "../src/commands/_lib/dev-batches.ts";
import {
  ACCEPTED_ARGS_CASES,
  CORRECTION_VERIFY,
  F2_INPUT,
  LAUNCH_CASES,
  MODE_CASES,
  NEXT_WAVE_INPUT,
  READ,
  REFUSED_ARGS_CASES,
  THIRTY_LINES,
  VALID_VERIFY,
} from "./commands-dev-batches.fixtures.ts";

describe("parseDevBatchesArgs", () => {
  for (const c of ACCEPTED_ARGS_CASES) {
    it(c.name, () => {
      // Arrange
      const { tokens } = c;

      // Act
      const parsed = parseDevBatchesArgs(tokens);

      // Assert
      deepStrictEqual(parsed, c.expected);
    });
  }

  for (const c of REFUSED_ARGS_CASES) {
    it(c.name, () => {
      // Arrange
      const { tokens } = c;

      // Act
      const parsed = parseDevBatchesArgs(tokens);

      // Assert
      strictEqual(parsed.ok, false);
    });
  }

  it("answers --help with the usage", () => {
    // Arrange
    const tokens = ["--help"];

    // Act
    const parsed = parseDevBatchesArgs(tokens);

    // Assert
    deepStrictEqual(parsed, { ok: false, text: DEV_BATCHES_USAGE });
  });
});

describe("batchesLaunchInput", () => {
  for (const c of LAUNCH_CASES) {
    it(c.name, () => {
      // Arrange
      const parsed = parseDevBatchesArgs(c.tokens);

      // Act
      const input = parsed.ok && batchesLaunchInput(parsed.args, READ);

      // Assert
      deepStrictEqual(input, c.expected);
    });
  }
});

describe("batchesModeRefusal", () => {
  for (const c of MODE_CASES) {
    it(c.name, () => {
      // Arrange
      const { args, mode } = c;

      // Act
      const refusal = batchesModeRefusal(args, mode);

      // Assert
      strictEqual(refusal, c.expected);
    });
  }
});

describe("batchesChainStep", () => {
  it("launches the batch the dev-batches crew names", () => {
    // Arrange
    const answer = JSON.stringify({ lines: ["→ F2 launched"], next: { crew: "dev-implement", input: F2_INPUT } });

    // Act
    const step = batchesChainStep("dev-batches", answer);

    // Assert
    deepStrictEqual(step, { lines: ["→ F2 launched"], launch: { crew: "dev-implement", input: F2_INPUT, instead: "/dev-implement F2 demo" } });
  });

  it("prints a dev-batches answer that names no batch", () => {
    // Arrange
    const answer = JSON.stringify({ lines: ["BLOCKED — x"] });

    // Act
    const step = batchesChainStep("dev-batches", answer);

    // Assert
    deepStrictEqual(step, { lines: ["BLOCKED — x"] });
  });

  it("launches the audit /dev-implement names, as its own chain does", () => {
    // Arrange
    const answer = JSON.stringify({ lines: ["a"], next: { crew: "dev-verify", input: { batch: "F2", plan: "demo" } } });

    // Act
    const step = batchesChainStep("dev-implement", answer);

    // Assert
    strictEqual(step.launch?.crew, "dev-verify");
  });

  it("closes a VALID batch without pushing it", () => {
    // Arrange
    const text = VALID_VERIFY;

    // Act
    const step = batchesChainStep("dev-verify", text);

    // Assert
    deepStrictEqual(step.launch, {
      crew: "dev-implement", input: { batch: "F2", plan: "workbench/demo/DEMO-PLAN.md", close: true, push: false },
      instead: "/dev-implement F2 workbench/demo/DEMO-PLAN.md --close",
    });
  });

  it("hands an answer that launches nothing back to the crew, its last lines with it", () => {
    // Arrange
    const text = CORRECTION_VERIFY;

    // Act
    const step = batchesChainStep("dev-verify", text);

    // Assert
    deepStrictEqual(step.launch, {
      crew: "dev-batches", input: { after: ["written: workbench/demo/DEMO-VERIFY-F2.md — capture: x/", "→ /dev-implement F2 — correction: Major y"] },
      instead: "/dev-batches",
    });
  });

  it("hands back at most 20 last lines of an answer that launches nothing", () => {
    // Arrange
    const many = THIRTY_LINES;

    // Act
    const step = batchesChainStep("dev-implement", many);

    // Assert
    strictEqual((step.launch?.input.after as string[]).length, 20);
  });

  it("launches the next wave the dev-batches crew names: the crew again, its input as given", () => {
    // Arrange
    const answer = JSON.stringify({ lines: ["✓ F2 merged"], next: { crew: "dev-batches", input: NEXT_WAVE_INPUT } });

    // Act
    const step = batchesChainStep("dev-batches", answer);

    // Assert
    deepStrictEqual(step, { lines: ["✓ F2 merged"], launch: { crew: "dev-batches", input: NEXT_WAVE_INPUT, instead: "/dev-batches --concurrency 2" } });
  });

  it("prints an answer of another crew as is", () => {
    // Arrange
    const text = "a\nb";

    // Act
    const step = batchesChainStep("other", text);

    // Assert
    deepStrictEqual(step, { lines: ["a", "b"] });
  });
});
