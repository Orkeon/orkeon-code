// /dev-batches' arguments in its three shapes and under its aliases, an audit's dispatch, and its chain in
// `completed` (src/commands/_lib/dev/dev-batches.ts): each answer told apart by the chain recorded and the crew that
// gave it. Run:
//   node --test tests/commands/_lib/dev/dev-batches.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import {
  BATCHES_CHAIN, DEV_BATCHES_USAGE, batchesChainStep, batchesHopFailedLine, batchesLaunchInput, batchesModeRefusal, batchesNextLaunch,
  devBatchesCompleted, launchBatchesHop, launchCompletedHop, parseDevBatchesArgs, readChain, recordChain,
} from "../../../../src/commands/_lib/dev/dev-batches.ts";
import { DEV_BATCHES_CHAIN_STATE_KEY } from "../../../../src/shared/domain/session-keys.ts";
import { FakeSessionStore } from "../../../support/doubles/fake-session-store.ts";
import { CONTEXT_NOT_READ_LINE } from "../../../../src/commands/_lib/dev/dev-implement.ts";
import { FakeCrewHost } from "../../../support/doubles/fake-crew-host.ts";
import { FakeLogger } from "../../../support/doubles/fake-logger.ts";
import { hopDeps } from "../../../support/fixtures/chain-hop.ts";
import {
  ACCEPTED_ARGS_CASES,
  ALIAS_CASES,
  AUDIT_READ_CASES,
  AUDIT_REFUSED_CASES,
  BATCH_READ_CASES,
  BATCH_REFUSED_CASES,
  READ_CHAIN_CASES,
  hopConfig,
  RECORD_FAILURE_CASES,
  STREAMED_AUDIT,
  verifyHarness,
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

describe("parseDevBatchesArgs, one batch", () => {
  for (const c of BATCH_READ_CASES) {
    it(c.name, () => {
      // Arrange
      const { tokens } = c;

      // Act
      const parsed = parseDevBatchesArgs(tokens);

      // Assert
      deepStrictEqual(parsed, { ok: true, route: "batch", args: c.args });
    });
  }

  for (const c of BATCH_REFUSED_CASES) {
    it(c.name, () => {
      // Arrange
      const { tokens } = c;

      // Act
      const parsed = parseDevBatchesArgs(tokens);

      // Assert
      deepStrictEqual(parsed, { ok: false, text: c.text });
    });
  }
});

describe("parseDevBatchesArgs, one audit", () => {
  for (const c of AUDIT_READ_CASES) {
    it(c.name, () => {
      // Arrange
      const { tokens } = c;

      // Act
      const parsed = parseDevBatchesArgs(tokens);

      // Assert
      deepStrictEqual(parsed, { ok: true, route: "audit", args: c.args });
    });
  }

  for (const c of AUDIT_REFUSED_CASES) {
    it(c.name, () => {
      // Arrange
      const { tokens } = c;

      // Act
      const parsed = parseDevBatchesArgs(tokens);

      // Assert
      deepStrictEqual(parsed, { ok: false, text: c.text });
    });
  }
});

describe("parseDevBatchesArgs, under an alias", () => {
  for (const c of ALIAS_CASES) {
    it(c.name, () => {
      // Arrange
      const { tokens, typed } = c;

      // Act
      const parsed = parseDevBatchesArgs(tokens, typed);

      // Assert
      deepStrictEqual(parsed, c.expected);
    });
  }
});

describe("runDevVerifyDispatch", () => {
  it("starts no step for the gate alone: no rule put in the gate, no hook", async () => {
    // Arrange
    const { gate, run } = verifyHarness();

    // Act
    const outcome = await run({ batch: "F2", plan: "demo", mode: "fast", gateOnly: true });

    // Assert
    deepStrictEqual([gate.calls, "input" in outcome ? outcome.input.hooks : "refused"], [[], []]);
  });

  it("refuses an audit when the host's gate is off, its line written", async () => {
    // Arrange
    const { gate, written, run } = verifyHarness();
    gate.hostGate = false;

    // Act
    const outcome = await run({ batch: "F2", plan: "demo", mode: "fast", gateOnly: false });

    // Assert
    deepStrictEqual(["refused" in outcome ? [outcome.refused] : [], written.length], [written, 1]);
  });

  it("records the audited batch as the one in progress", async () => {
    // Arrange
    const { store, run } = verifyHarness();

    // Act
    await run({ batch: "F2", plan: "workbench/demo/DEMO-PLAN.md", mode: "fast", gateOnly: true });

    // Assert
    strictEqual(store.state.has("workflow_active"), true);
  });
});

describe("recordChain", () => {
  it("keeps the chain it is handed in the session", async () => {
    // Arrange
    const store = new FakeSessionStore();

    // Act
    await recordChain(store, "audit");

    // Assert
    strictEqual(store.state.get(DEV_BATCHES_CHAIN_STATE_KEY), "audit");
  });

  for (const c of RECORD_FAILURE_CASES) {
    it(`answers ${c.expected === null ? "nothing" : "a refusal"} for a ${c.chain} the session cannot keep`, async () => {
      // Arrange
      const store = new FakeSessionStore();
      store.writeStateFailure = new Error("no state\nstack");

      // Act
      const refusal = await recordChain(store, c.chain);

      // Assert
      strictEqual(refusal, c.expected);
    });
  }
});

describe("readChain", () => {
  for (const c of READ_CHAIN_CASES) {
    it(c.name, async () => {
      // Arrange
      const store = new FakeSessionStore();
      if (c.stored !== null) store.state.set(DEV_BATCHES_CHAIN_STATE_KEY, c.stored);

      // Act
      const chain = await readChain(store, c.intent);

      // Assert
      strictEqual(chain, c.expected);
    });
  }

  it("reads an answer as a run when the session cannot be read", async () => {
    // Arrange
    const store = new FakeSessionStore();
    store.readStateFailure = new Error("no state");

    // Act
    const chain = await readChain(store, "dev-verify");

    // Assert
    strictEqual(chain, "run");
  });
});

describe("devBatchesCompleted", () => {
  it("prints an audit's verdict and launches nothing in an audit's chain", async () => {
    // Arrange
    const session = new FakeSessionStore();
    session.state.set(DEV_BATCHES_CHAIN_STATE_KEY, "audit");

    // Act
    const completion = await devBatchesCompleted(CLOSE_RESULT, { ...hopDeps(), session });

    // Assert
    deepStrictEqual(completion, { chain: "audit", lines: [VALID_VERIFY] });
  });

  it("prints nothing of an audit the console already showed", async () => {
    // Arrange
    const session = new FakeSessionStore();
    session.state.set(DEV_BATCHES_CHAIN_STATE_KEY, "audit");

    // Act
    const completion = await devBatchesCompleted(STREAMED_AUDIT, { ...hopDeps(), session });

    // Assert
    deepStrictEqual(completion, { chain: "audit", lines: [] });
  });

  it("says an audit failed in an audit's chain", async () => {
    // Arrange
    const session = new FakeSessionStore();
    session.state.set(DEV_BATCHES_CHAIN_STATE_KEY, "audit");

    // Act
    const completion = await devBatchesCompleted({ success: false, intent: "dev-verify", error: "boom" }, { ...hopDeps(), session });

    // Assert
    deepStrictEqual(completion.lines, ["✗ the audit failed: boom"]);
  });

  it("closes a batch's VALID audit in the batch's own chain, its push left to the close", async () => {
    // Arrange
    const session = new FakeSessionStore();
    session.state.set(DEV_BATCHES_CHAIN_STATE_KEY, "batch");

    // Act
    const completion = await devBatchesCompleted(CLOSE_RESULT, { ...hopDeps(), session });

    // Assert
    deepStrictEqual([completion.chain, completion.launch?.input.close, completion.launch?.input.push], ["batch", true, undefined]);
  });

  it("hands a run's answer that launches nothing back to the dev-batches crew", async () => {
    // Arrange
    const session = new FakeSessionStore();
    session.state.set(DEV_BATCHES_CHAIN_STATE_KEY, "run");

    // Act
    const completion = await devBatchesCompleted({ success: true, intent: "dev-verify", payload: CORRECTION_VERIFY }, { ...hopDeps(), session });

    // Assert
    deepStrictEqual([completion.chain, completion.launch?.crew], ["run", "dev-batches"]);
  });
});

describe("launchCompletedHop", () => {
  it("launches a batch's hop as it climbs, with no chain option", async () => {
    // Arrange
    const crews = new FakeCrewHost();

    // Act
    await launchCompletedHop({ chain: "batch", lines: [], launch: BATCH_LAUNCH }, { crews, log: new FakeLogger() }, hopConfig());

    // Assert
    deepStrictEqual(crews.launches.map((l) => l.options), [undefined]);
  });

  it("launches a run's hop with the parent's depth kept", async () => {
    // Arrange
    const crews = new FakeCrewHost();

    // Act
    await launchCompletedHop({ chain: "run", lines: [], launch: BATCH_LAUNCH }, { crews, log: new FakeLogger() }, hopConfig());

    // Assert
    deepStrictEqual(crews.launches.map((l) => l.options), [BATCHES_CHAIN]);
  });

  it("launches nothing and leaves no line for a completion without a hop", async () => {
    // Arrange
    const crews = new FakeCrewHost();

    // Act
    const lines = await launchCompletedHop({ chain: "audit", lines: ["x"] }, { crews, log: new FakeLogger() }, hopConfig());

    // Assert
    deepStrictEqual([lines, crews.launches], [[], []]);
  });

  it("hands the hop the session's llm.profile", async () => {
    // Arrange
    const crews = new FakeCrewHost();

    // Act
    await launchCompletedHop({ chain: "run", lines: [], launch: BATCH_LAUNCH }, { crews, log: new FakeLogger() }, hopConfig("guarded"));

    // Assert
    strictEqual(crews.launches[0].input.llmProfile, "guarded");
  });
});

describe("batchesLaunchInput", () => {
  for (const c of LAUNCH_CASES) {
    it(c.name, () => {
      // Arrange
      const parsed = parseDevBatchesArgs(c.tokens);

      // Act
      const input = parsed.ok && parsed.route === "run" && batchesLaunchInput(parsed.args, READ);

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
    deepStrictEqual(step, { lines: ["→ F2 launched"], launch: { crew: "dev-implement", input: F2_INPUT, instead: "/dev-batches demo F2" } });
  });

  it("prints a dev-batches answer that names no batch", () => {
    // Arrange
    const answer = JSON.stringify({ lines: ["BLOCKED — x"] });

    // Act
    const step = batchesChainStep("dev-batches", answer);

    // Assert
    deepStrictEqual(step, { lines: ["BLOCKED — x"] });
  });

  it("launches the audit a batch names, as its own chain does", () => {
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
      instead: "/dev-batches workbench/demo/DEMO-PLAN.md F2 --close",
    });
  });

  it("hands an answer that launches nothing back to the crew, its last lines with it", () => {
    // Arrange
    const text = CORRECTION_VERIFY;

    // Act
    const step = batchesChainStep("dev-verify", text);

    // Assert
    deepStrictEqual(step.launch, {
      crew: "dev-batches", input: { after: ["written: workbench/demo/DEMO-VERIFY-F2.md — capture: x/", "→ /dev-batches demo F2 — correction: Major y"] },
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
      "then type /dev-batches workbench/demo/DEMO-PLAN.md F2 --close",
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
    deepStrictEqual([step.launch, step.lines.slice(-2)], [undefined, ["✗ the host's gate is off", "then type /dev-batches demo F2"]]);
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
    deepStrictEqual([lines.length, lines[1]], [2, "then type /dev-batches demo F2"]);
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
