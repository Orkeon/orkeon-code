// /dev-batches' arguments and its chain in `completed` (src/commands/_lib/dev/dev-batches.ts): each answer
// told apart by the crew that gave it. Run:
//   node --test tests/commands/_lib/dev/dev-batches.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import {
  BATCHES_CHAIN, DEV_BATCHES_USAGE, batchesChainStep, batchesHopFailedLine, batchesLaunchInput, batchesModeRefusal, batchesNextLaunch,
  launchBatchesHop, parseDevBatchesArgs,
} from "../../../../src/commands/_lib/dev/dev-batches.ts";
import { CONTEXT_NOT_READ_LINE } from "../../../../src/commands/_lib/dev/dev-implement.ts";
import { FakeCrewHost } from "../../../support/doubles/fake-crew-host.ts";
import { FakeLogger } from "../../../support/doubles/fake-logger.ts";
import { hopDeps } from "../../../support/fixtures/chain-hop.ts";
import {
  ACCEPTED_ARGS_CASES,
  BATCH_LAUNCH,
  CLOSE_RESULT,
  CORRECTION_VERIFY,
  F2_INPUT,
  FRESH_RULES,
  NEXT_BATCH_RESULT,
  NEXT_WAVE_RESULT,
  LAUNCH_CASES,
  MODE_CASES,
  NEXT_WAVE_INPUT,
  READ,
  REFUSED_ARGS_CASES,
  THIRTY_LINES,
  VALID_VERIFY,
} from "./dev-batches.fixtures.ts";

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
      crew: "dev-implement", input: { batch: "F2", plan: "workbench/demo/DEMO-PLAN.md", close: true, push: false, githubTool: false },
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

describe("batchesNextLaunch", () => {
  it("says the chain failed and what to type on a failed run", async () => {
    // Arrange
    const result = { success: false, intent: "dev-verify", error: "boom" };

    // Act
    const step = await batchesNextLaunch(result, hopDeps());

    // Assert
    deepStrictEqual(step, {
      lines: ["✗ the dev-batches chain failed (dev-verify): boom", "then type /dev-batches: the run goes on from the first batch not done"],
    });
  });

  it("launches the next batch with the rule the session gained since the last one (Orkeon #220)", async () => {
    // Arrange
    const deps = hopDeps({ context: { permissionRules: FRESH_RULES } });

    // Act
    const step = await batchesNextLaunch(NEXT_BATCH_RESULT, deps);

    // Assert
    deepStrictEqual(step.launch?.input, { ...BATCH_LAUNCH.input, permissionMode: "acceptEdits", permissionRules: FRESH_RULES, githubTool: false });
  });

  it("keeps a batch's launch without the github tool, whatever the session offers", async () => {
    // Arrange
    const deps = hopDeps({ context: { githubTool: true } });

    // Act
    const step = await batchesNextLaunch(NEXT_BATCH_RESULT, deps);

    // Assert
    strictEqual(step.launch?.input.githubTool, false);
  });

  it("launches the audit as the batch named it, without reading the session again", async () => {
    // Arrange
    const deps = hopDeps();
    const result = { success: true, intent: "dev-implement", payload: JSON.stringify({ lines: ["a"], next: { crew: "dev-verify", input: F2_INPUT } }) };

    // Act
    const step = await batchesNextLaunch(result, deps);

    // Assert
    deepStrictEqual([step.launch?.input, deps.reads], [F2_INPUT, 0]);
  });

  it("refuses a hop once the session went read-only, naming /mode and the command to type", async () => {
    // Arrange
    const deps = hopDeps({ context: { permissionMode: "plan" } });

    // Act
    const step = await batchesNextLaunch(CLOSE_RESULT, deps);

    // Assert
    deepStrictEqual([step.launch, step.lines.slice(-2)], [undefined, [
      "✗ refused: the session mode plan is read-only, and /dev-batches writes files, commits and pushes: /mode default, then run it again",
      "then type /dev-implement F2 workbench/demo/DEMO-PLAN.md --close",
    ]]);
  });

  it("refuses the next wave of a parallel run once the session asks before shell commands", async () => {
    // Arrange
    const deps = hopDeps({ context: { permissionMode: "default" } });

    // Act
    const step = await batchesNextLaunch(NEXT_WAVE_RESULT, deps);

    // Assert
    deepStrictEqual([step.launch, step.lines.at(-1)], [undefined, "then type /dev-batches --concurrency 2"]);
  });

  it("launches the hop as the crew named it, said in a line, when the session cannot be read again", async () => {
    // Arrange
    const deps = hopDeps({ context: new Error("no session") });

    // Act
    const step = await batchesNextLaunch(NEXT_BATCH_RESULT, deps);

    // Assert
    deepStrictEqual([step.launch, step.lines.at(-1)], [BATCH_LAUNCH, CONTEXT_NOT_READ_LINE]);
  });

  it("launches nothing when the gate refuses the step, and names the command to type", async () => {
    // Arrange
    const deps = hopDeps({ refusal: "the host's gate is off" });

    // Act
    const step = await batchesNextLaunch(NEXT_BATCH_RESULT, deps);

    // Assert
    deepStrictEqual([step.launch, step.lines.slice(-2)], [undefined, ["✗ the host's gate is off", "then type /dev-implement F2 demo"]]);
  });
});

describe("launchBatchesHop", () => {
  it("launches every hop with the parent's depth kept: chain continue (Orkeon #221)", () => {
    // Arrange
    const crews = new FakeCrewHost();
    const log = new FakeLogger();

    // Act
    const lines = launchBatchesHop(BATCH_LAUNCH, { crews, log });

    // Assert
    deepStrictEqual([lines, crews.launches], [[], [{ name: "dev-implement", input: BATCH_LAUNCH.input, options: BATCHES_CHAIN }]]);
  });

  it("writes the refusal of a hop and the command to type", () => {
    // Arrange
    const crews = new FakeCrewHost();
    crews.launchFailure = new Error("chain depth 8 reached (MaxChainDepth 8, /dev-batches)");
    const log = new FakeLogger();

    // Act
    const lines = launchBatchesHop(BATCH_LAUNCH, { crews, log });

    // Assert
    deepStrictEqual([lines.length, lines[1]], [2, "then type /dev-implement F2 demo"]);
  });
});

describe("batchesHopFailedLine", () => {
  it("names the first line of the failure and what to type", () => {
    // Arrange
    const error = new Error("no services\nstack");

    // Act
    const line = batchesHopFailedLine(error);

    // Assert
    strictEqual(line, "✗ the dev-batches chain stopped (no services): then type /dev-batches: the run goes on from the first batch not done");
  });
});
