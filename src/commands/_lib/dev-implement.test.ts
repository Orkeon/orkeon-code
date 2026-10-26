// /dev-implement's arguments and its chain in `completed` (src/commands/_lib/dev-implement.ts). Run:
//   node --test src/commands/_lib/dev-implement.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { chainStep, DEV_IMPLEMENT_USAGE, launchChained, nextLaunch, parseDevImplementArgs } from "./dev-implement.ts";
import { writeModeRefusal } from "./dev-step.ts";
import {
  AUDIT_LAUNCH,
  AUDIT_PAYLOAD,
  CORRECTION_CASES,
  GAPS_TEXT,
  NO_CLOSE_CASES,
  QUOTED_VALID,
  READ_CASES,
  REFUSED_CASES,
  REFUSED_MODES,
  STEPS_CASES,
  VALID_TEXT,
  WRITES,
  WRITING_MODES,
  dispatchHarness,
} from "./dev-implement.fixtures.ts";

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

describe("runDevImplementDispatch", () => {
  it("refuses a read-only mode before the step starts, its line written", async () => {
    // Arrange
    const { gate, written, run } = dispatchHarness("plan");
    const line = writeModeRefusal("plan", "dev-implement", WRITES);

    // Act
    const outcome = await run("F1", "demo");

    // Assert
    deepStrictEqual([outcome, written, gate.calls], [{ refused: line }, [line], []]);
  });

  it("writes the usage and refuses arguments it cannot read", async () => {
    // Arrange
    const { written, run } = dispatchHarness();

    // Act
    const outcome = await run();

    // Assert
    deepStrictEqual([outcome, written], [{ refused: DEV_IMPLEMENT_USAGE }, [DEV_IMPLEMENT_USAGE]]);
  });

  it("refuses when the host's gate is off", async () => {
    // Arrange
    const { gate, run } = dispatchHarness();
    gate.hostGate = false;

    // Act
    const outcome = await run("F1", "demo");

    // Assert
    strictEqual("refused" in outcome, true);
  });

  for (const c of STEPS_CASES) {
    it(c.name, async () => {
      // Arrange
      const { run } = dispatchHarness();

      // Act
      const outcome = await run(...c.tokens);

      // Assert
      strictEqual("input" in outcome ? outcome.input.steps : "refused", c.steps);
    });
  }
});

describe("nextLaunch", () => {
  it("says the chain failed and launches nothing on a failed run", () => {
    // Arrange
    const result = { success: false, error: "boom" };

    // Act
    const step = nextLaunch(result, () => null);

    // Assert
    deepStrictEqual(step, { lines: ["✗ the dev-implement chain failed: boom"] });
  });

  it("chains to the crew the answer names, its rules put back first", () => {
    // Arrange
    const reapplied: string[] = [];

    // Act
    const step = nextLaunch({ success: true, payload: AUDIT_PAYLOAD }, (crew) => { reapplied.push(crew); return null; });

    // Assert
    deepStrictEqual([step, reapplied], [{ lines: ["a", "b"], launch: AUDIT_LAUNCH }, ["dev-verify"]]);
  });

  it("launches nothing when the gate refuses the chained step, and names the command to type", () => {
    // Arrange
    const reapply = () => "the host's gate is off";

    // Act
    const step = nextLaunch({ success: true, payload: AUDIT_PAYLOAD }, reapply);

    // Assert
    deepStrictEqual(step, { lines: ["a", "b", "✗ the host's gate is off", "then type /dev-verify F1 demo"] });
  });
});

describe("launchChained", () => {
  it("leaves no line once the crew is launched", () => {
    // Arrange
    const run = () => ({ ticket: "t-1" });

    // Act
    const lines = launchChained(AUDIT_LAUNCH, run);

    // Assert
    deepStrictEqual(lines, []);
  });

  it("writes the launch's refusal and the command to type", () => {
    // Arrange
    const run = () => ({ refused: "chain too deep", message: "chain too deep" });

    // Act
    const lines = launchChained(AUDIT_LAUNCH, run);

    // Assert
    deepStrictEqual(lines, ["✗ chain too deep", "then type /dev-verify F1 demo"]);
  });

  it("writes the first line of a launch that throws, and the command to type", () => {
    // Arrange
    const run = (): never => { throw new Error("no crew host\nstack"); };

    // Act
    const lines = launchChained(AUDIT_LAUNCH, run);

    // Assert
    deepStrictEqual(lines, ["✗ dev-verify could not be launched (no crew host): type /dev-verify F1 demo"]);
  });
});
