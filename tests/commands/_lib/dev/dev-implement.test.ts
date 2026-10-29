// One batch of /dev-batches: its dispatch and its chain in `completed` (src/commands/_lib/dev/dev-implement.ts). Run:
//   node --test tests/commands/_lib/dev/dev-implement.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import {
  CONTEXT_NOT_READ_LINE, chainStep, launchChained, nextLaunch,
} from "../../../../src/commands/_lib/dev/dev-implement.ts";
import { writeModeRefusal } from "../../../../src/commands/_lib/dev-step.ts";
import {
  AUDIT_LAUNCH,
  AUDIT_PAYLOAD,
  CLOSE_LAUNCH,
  GAPS_TEXT,
  NO_CLOSE_CASES,
  QUOTED_VALID,
  REFUSED_MODES,
  STEPS_CASES,
  VALID_TEXT,
  WRITES,
  WRITING_MODES,
  dispatchHarness,
  implementArgs,
} from "./dev-implement.fixtures.ts";
import { FRESH_CONTEXT, hopDeps } from "../../../support/fixtures/chain-hop.ts";

describe("chainStep", () => {
  it("prints the crew's lines and launches the audit it names", () => {
    // Arrange
    const payload = AUDIT_PAYLOAD;

    // Act
    const step = chainStep(payload);

    // Assert
    deepStrictEqual(step, { lines: ["a", "b"], launch: { crew: "dev-verify", input: { batch: "F1", plan: "demo" }, instead: "/dev-batches demo F1 --audit" } });
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
    deepStrictEqual(step.launch, { crew: "dev-verify", input, instead: "/dev-batches demo F1 --audit resume" });
  });

  it("launches the close on the audit's VALID line, its plan read off the verdict file", () => {
    // Arrange
    const text = VALID_TEXT;

    // Act
    const step = chainStep(text);

    // Assert
    deepStrictEqual(step.launch, {
      crew: "dev-implement", input: { batch: "F1", plan: "workbench/demo/DEMO-PLAN.md", close: true },
      instead: "/dev-batches workbench/demo/DEMO-PLAN.md F1 --close",
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

describe("writeModeRefusal, for /dev-batches", () => {
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
    const line = writeModeRefusal("plan", "dev-batches", WRITES);

    // Act
    const outcome = await run(implementArgs({ plan: "demo" }));

    // Assert
    deepStrictEqual([outcome, written, gate.calls], [{ refused: line }, [line], []]);
  });

  it("refuses when the host's gate is off", async () => {
    // Arrange
    const { gate, run } = dispatchHarness();
    gate.hostGate = false;

    // Act
    const outcome = await run(implementArgs({ plan: "demo" }));

    // Assert
    strictEqual("refused" in outcome, true);
  });

  for (const c of STEPS_CASES) {
    it(c.name, async () => {
      // Arrange
      const { run } = dispatchHarness();

      // Act
      const outcome = await run(c.args);

      // Assert
      strictEqual("input" in outcome ? outcome.input.steps : "refused", c.steps);
    });
  }
});

describe("nextLaunch", () => {
  it("says the chain failed and launches nothing on a failed run", async () => {
    // Arrange
    const result = { success: false, error: "boom" };

    // Act
    const step = await nextLaunch(result, hopDeps());

    // Assert
    deepStrictEqual(step, { lines: ["✗ the batch's chain failed: boom"] });
  });

  it("chains to the audit the answer names, its rules put back first, without reading the session again", async () => {
    // Arrange
    const deps = hopDeps();

    // Act
    const step = await nextLaunch({ success: true, payload: AUDIT_PAYLOAD }, deps);

    // Assert
    deepStrictEqual([step, deps.reapplied, deps.reads], [{ lines: ["a", "b"], launch: AUDIT_LAUNCH }, ["dev-verify"], 0]);
  });

  it("launches nothing when the gate refuses the chained step, and names the command to type", async () => {
    // Arrange
    const deps = hopDeps({ refusal: "the host's gate is off" });

    // Act
    const step = await nextLaunch({ success: true, payload: AUDIT_PAYLOAD }, deps);

    // Assert
    deepStrictEqual(step, { lines: ["a", "b", "✗ the host's gate is off", "then type /dev-batches demo F1 --audit"] });
  });

  it("launches the close with the session's context read again: its mode, rules and github tool (Orkeon #220)", async () => {
    // Arrange
    const deps = hopDeps({ context: FRESH_CONTEXT });

    // Act
    const step = await nextLaunch({ success: true, payload: VALID_TEXT }, deps);

    // Assert
    deepStrictEqual(step.launch, { ...CLOSE_LAUNCH, input: { ...CLOSE_LAUNCH.input, ...FRESH_CONTEXT } });
  });

  it("launches no close once the session went read-only between the audit and the close, and names /mode and the command", async () => {
    // Arrange
    const deps = hopDeps({ context: { ...FRESH_CONTEXT, permissionMode: "plan" } });

    // Act
    const step = await nextLaunch({ success: true, payload: VALID_TEXT }, deps);

    // Assert
    deepStrictEqual(step, {
      lines: [
        ...VALID_TEXT.split("\n"), `→ the close follows: ${CLOSE_LAUNCH.instead}`,
        "✗ refused: the session mode plan is read-only, and /dev-batches commits (the close of the batch): /mode default, then run it again",
        `then type ${CLOSE_LAUNCH.instead}`,
      ],
    });
  });

  it("launches the close as the audit named it, said in a line, when the session cannot be read again: the record's context applies", async () => {
    // Arrange
    const deps = hopDeps({ context: new Error("no session service") });

    // Act
    const step = await nextLaunch({ success: true, payload: VALID_TEXT }, deps);

    // Assert
    deepStrictEqual([step.launch, step.lines.at(-1)], [CLOSE_LAUNCH, CONTEXT_NOT_READ_LINE]);
  });

  it("launches the close as the audit named it when the session's mode comes back empty", async () => {
    // Arrange
    const deps = hopDeps({ context: { ...FRESH_CONTEXT, permissionMode: "" } });

    // Act
    const step = await nextLaunch({ success: true, payload: VALID_TEXT }, deps);

    // Assert
    deepStrictEqual([step.launch, step.lines.at(-1)], [CLOSE_LAUNCH, CONTEXT_NOT_READ_LINE]);
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
    deepStrictEqual(lines, ["✗ chain too deep", "then type /dev-batches demo F1 --audit"]);
  });

  it("hands the launch its options as given", () => {
    // Arrange
    const given: unknown[] = [];
    const run = (_crew: string, _input: Record<string, unknown>, options?: unknown) => { given.push(options); return { ticket: "t-1" }; };

    // Act
    launchChained(AUDIT_LAUNCH, run, { chain: "continue" });

    // Assert
    deepStrictEqual(given, [{ chain: "continue" }]);
  });

  it("writes the first line of a launch that throws, and the command to type", () => {
    // Arrange
    const run = (): never => { throw new Error("no crew host\nstack"); };

    // Act
    const lines = launchChained(AUDIT_LAUNCH, run);

    // Assert
    deepStrictEqual(lines, ["✗ dev-verify could not be launched (no crew host): type /dev-batches demo F1 --audit"]);
  });
});
