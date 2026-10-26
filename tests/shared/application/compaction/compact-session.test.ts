// The compaction pipeline over the fakes of its ports. Run:
//   node --test tests/shared/application/compaction/compact-session.test.ts
import { describe, it } from "node:test";
import { ok, deepStrictEqual, strictEqual } from "node:assert";

import { COMPACT_PROGRESS_LABEL, compactSession, readCompactionTrigger, snipBuffer } from "../../../../src/shared/application/compaction/compact-session.ts";
import {
  buildCompactedBuffer, buildMemoryExtractionPrompt, buildRestoredStateMessage, buildSummaryPrompt, buildTranscript,
} from "../../../../src/shared/domain/compaction.ts";
import { SNIP_RETAIN_COUNT } from "../../../../src/shared/domain/compaction-thresholds.ts";
import { SKILLS_STATE_KEY } from "../../../../src/shared/domain/session-keys.ts";
import { FakeSessionStore } from "../../../support/doubles/fake-session-store.ts";
import {
  ABOVE, BELOW, FULL_PIPELINE_LOG, FULL_PIPELINE_STEPS, HISTORY, TRIGGER_SETTINGS, WRITTEN, compactSetup, fullPipelineBuffer,
  withWorkflow,
} from "./compact-session.fixtures.ts";
import { assertNoStatePointer } from "./compact-session.assertions.ts";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";

describe("compactSession: nothing to compact", () => {
  it("skips a buffer too small, without progress or model call", async () => {
    // Arrange
    const deps = compactSetup();
    deps.session.messages = HISTORY.slice(0, 2);

    // Act
    const outcome = await compactSession({ force: true }, deps);

    // Assert
    deepStrictEqual(outcome, { status: "skipped", reason: "buffer too small" });
    deepStrictEqual(deps.progress.reports, []);
    deepStrictEqual(deps.llm.extracts, []);
  });

  it("skips below the trigger when the run is threshold-gated", async () => {
    // Arrange
    const deps = compactSetup();
    deps.session.budget = BELOW;

    // Act
    const outcome = await compactSession({ force: false }, deps);

    // Assert
    deepStrictEqual(outcome, { status: "skipped", reason: "below trigger", usedTokens: BELOW.used });
    deepStrictEqual(deps.session.snips, []);
  });

  it("does not skip below the trigger when the run is forced", async () => {
    // Arrange
    const deps = compactSetup();
    deps.session.budget = BELOW;

    // Act
    const outcome = await compactSession({ force: true }, deps);

    // Assert
    strictEqual(outcome.status, "snipped");
  });
});

describe("compactSession: the full pipeline", () => {
  it("extracts memories, snips, summarises, restores files and skills, and rewrites the buffer", async () => {
    // Arrange
    const deps = compactSetup();
    deps.files.files.set(`${WORKSPACE}/src/a.ts`, "export const a = 1;");
    deps.files.files.set(`${WORKSPACE}/skills/s.md`, "# Skill");
    deps.session.state.set(SKILLS_STATE_KEY, `["${WORKSPACE}/skills/s.md"]`);
    const transcript = buildTranscript(HISTORY);
    const prompt = buildSummaryPrompt(transcript);

    // Act
    const outcome = await compactSession({ force: false }, deps);

    // Assert
    deepStrictEqual(outcome, { status: "compacted", before: 4, after: 6, usedTokens: ABOVE.used });
    deepStrictEqual(deps.llm.extracts.map((c) => c.prompt), [buildMemoryExtractionPrompt(transcript)]);
    deepStrictEqual(deps.memory.records.map((r) => [r.category, r.content]), [["project", "uses pnpm"]]);
    deepStrictEqual(deps.session.snips, [SNIP_RETAIN_COUNT]);
    deepStrictEqual(deps.llm.completes, [{ prompt: prompt.user, override: { system: prompt.system } }]);
    deepStrictEqual(deps.session.messages, fullPipelineBuffer());
    deepStrictEqual(deps.progress.reports.map((r) => [r.step, r.total, r.message]), FULL_PIPELINE_STEPS);
    deepStrictEqual(deps.progress.released, [COMPACT_PROGRESS_LABEL]);
    deepStrictEqual(deps.log.lines, FULL_PIPELINE_LOG);
  });

  it("stops at the snip when it brought usage under the trigger: no summary is paid", async () => {
    // Arrange
    const deps = compactSetup();
    deps.session.budgetAfterSnip = BELOW;

    // Act
    const outcome = await compactSession({ force: true }, deps);

    // Assert
    deepStrictEqual(outcome, { status: "snipped", before: 4, usedTokens: BELOW.used });
    deepStrictEqual(deps.llm.completes, []);
    deepStrictEqual(deps.session.messages, HISTORY);
    deepStrictEqual(deps.memory.records.length, 1);
    deepStrictEqual(deps.progress.released, [COMPACT_PROGRESS_LABEL]);
  });

  it("compacts without memories when the extraction fails", async () => {
    // Arrange
    const deps = compactSetup();
    deps.llm.extractions = [new Error("not JSON")];

    // Act
    const outcome = await compactSession({ force: true }, deps);

    // Assert
    strictEqual(outcome.status, "compacted");
    deepStrictEqual(deps.session.messages, buildCompactedBuffer(HISTORY[0], "SUMMARY"));
  });
});

describe("compactSession: the summary call", () => {
  it("passes the operator's focus to the summary prompt and keeps only what the markers enclose", async () => {
    // Arrange
    const deps = compactSetup();
    deps.llm.completions = ["Sure.\n<summary>1. The request: ship it</summary>\nAnything else?"];

    // Act
    const outcome = await compactSession({ force: true, focus: "the release steps" }, deps);

    // Assert
    strictEqual(outcome.status, "compacted");
    ok(String(deps.llm.completes[0].override?.system).includes("keep above all: the release steps"));
    const summary = deps.session.messages.find((m) => String(m.content).startsWith("[compacted]"));
    ok(String(summary?.content).endsWith("\n1. The request: ship it"), String(summary?.content));
  });

  it("lists what memory already holds in the extraction prompt", async () => {
    // Arrange
    const deps = compactSetup();
    await deps.memory.add("project", "releases are cut from main");

    // Act
    await compactSession({ force: true }, deps);

    // Assert
    ok(deps.llm.extracts[0].prompt.includes("- releases are cut from main"), deps.llm.extracts[0].prompt);
  });
});

describe("compactSession: failures are outcomes", () => {
  it("reports the model's failure, leaves the buffer and releases the progress", async () => {
    // Arrange
    const deps = compactSetup();
    deps.llm.completions = [new Error("model down")];

    // Act
    const outcome = await compactSession({ force: true }, deps);

    // Assert
    deepStrictEqual(outcome, { status: "failed", reason: "model down" });
    deepStrictEqual(deps.session.messages, HISTORY);
    deepStrictEqual(deps.progress.released, [COMPACT_PROGRESS_LABEL]);
  });

  it("fails on an empty summary rather than replace the history with nothing", async () => {
    // Arrange
    const deps = compactSetup();
    deps.llm.completions = ["<summary>   </summary>"];

    // Act
    const outcome = await compactSession({ force: true }, deps);

    // Assert
    deepStrictEqual(outcome, { status: "failed", reason: "the summary came back empty" });
    deepStrictEqual(deps.session.messages, HISTORY);
    deepStrictEqual(deps.progress.released, [COMPACT_PROGRESS_LABEL]);
  });

  it("reports a session that cannot be read", async () => {
    // Arrange
    const deps = compactSetup();
    deps.session.failure = new Error("session store down");

    // Act
    const outcome = await compactSession({ force: true }, deps);

    // Assert
    deepStrictEqual(outcome, { status: "failed", reason: "session store down" });
    deepStrictEqual(deps.progress.reports, []);
  });

  it("never fails over its log", async () => {
    // Arrange
    const deps = compactSetup();
    deps.log.info = () => { throw new Error("log closed"); };

    // Act
    const outcome = await compactSession({ force: true }, deps);

    // Assert
    strictEqual(outcome.status, "compacted");
  });
});

describe("/compact --snip and the compaction.trigger setting", () => {
  it("snips to the head and the last exchanges, and says what it did", async () => {
    // Arrange
    const session = new FakeSessionStore();
    session.snipped = { removed: 12, retained: 4 };

    // Act
    const out = await snipBuffer(3, { session });

    // Assert
    strictEqual(out, "snipped: 12 removed, 4 kept.");
    deepStrictEqual(session.snips, [3]);
  });

  for (const c of TRIGGER_SETTINGS) {
    it(`reads the setting as a token count, and nothing when it is unset or wrong: ${c.name}`, async () => {
      // Arrange
      const { store } = c;

      // Act
      const trigger = await readCompactionTrigger(store);

      // Assert
      strictEqual(trigger, c.trigger);
    });
  }

  it("skips below the trigger computed without the setting", async () => {
    // Arrange
    const deps = compactSetup();
    deps.session.budget = { used: 50_000, window: 200_000 };

    // Act
    const outcome = await compactSession({ force: false }, deps);

    // Assert
    strictEqual(outcome.status, "skipped", "below the computed trigger");
  });

  it("compacts at the trigger the setting gives", async () => {
    // Arrange
    const deps = compactSetup();
    deps.session.budget = { used: 50_000, window: 200_000 };

    // Act
    const outcome = await compactSession({ force: false, trigger: 40_000 }, deps);

    // Assert
    strictEqual(outcome.status, "compacted");
  });
});

describe("compactSession: step 0, the state of the dev batch in progress", () => {
  it("writes the state before the extraction, then points at it last in the new buffer", async () => {
    // Arrange
    const { deps, calls } = withWorkflow();

    // Act
    const outcome = await compactSession({ force: false }, deps);

    // Assert
    deepStrictEqual(calls, [{ trigger: "auto", extracted: 0 }]);
    deepStrictEqual(outcome, { status: "compacted", before: 4, after: 5, usedTokens: ABOVE.used, state: { path: WRITTEN.path } });
    deepStrictEqual(deps.session.messages.at(-1), buildRestoredStateMessage(`${WORKSPACE}/${WRITTEN.path}`, WRITTEN.firstOpen));
    ok(deps.log.lines.includes(`info: state of the batch in progress written to ${WRITTEN.path}`), JSON.stringify(deps.log.lines));
  });

  it("writes it on the snip-only path too, which leaves the buffer as the snip left it", async () => {
    // Arrange
    const { deps, calls } = withWorkflow();
    deps.session.budgetAfterSnip = BELOW;

    // Act
    const outcome = await compactSession({ force: true }, deps);

    // Assert
    deepStrictEqual(outcome, { status: "snipped", before: 4, usedTokens: BELOW.used, state: { path: WRITTEN.path } });
    deepStrictEqual(calls.map((c) => c.trigger), ["manual"]);
    deepStrictEqual(deps.session.messages, HISTORY);
  });

  it("writes it under /compact even on a buffer too small", async () => {
    // Arrange
    const small = withWorkflow();
    small.deps.session.messages = HISTORY.slice(0, 2);

    // Act
    const outcome = await compactSession({ force: true }, small.deps);

    // Assert
    deepStrictEqual(outcome, { status: "skipped", reason: "buffer too small", state: { path: WRITTEN.path } });
    strictEqual(small.calls.length, 1);
  });

  it("does not write it below the trigger of an automatic run", async () => {
    // Arrange
    const below = withWorkflow();
    below.deps.session.budget = BELOW;

    // Act
    const outcome = await compactSession({ force: false }, below.deps);

    // Assert
    strictEqual(outcome.status, "skipped");
    deepStrictEqual(below.calls, []);
  });

  it("goes on when the state cannot be written, saying so, with no pointer", async () => {
    // Arrange
    const failing = withWorkflow(new Error("disk full\nmore"));

    // Act
    const outcome = await compactSession({ force: false }, failing.deps);

    // Assert
    strictEqual(outcome.status, "compacted");
    deepStrictEqual(outcome.state, { skipped: "it could not be written (disk full)" });
    ok(failing.deps.log.lines.includes("warn: the state of the batch in progress could not be written: disk full"));
    assertNoStatePointer(failing.deps.session.messages);
  });

  it("no batch, no state and no pointer", async () => {
    // Arrange
    const none = withWorkflow(null);

    // Act
    const plain = await compactSession({ force: false }, none.deps);

    // Assert
    strictEqual(plain.state, undefined);
    strictEqual(none.deps.session.messages.length, 4);
  });

  it("reports a skipped state in the outcome without pointing at any file", async () => {
    // Arrange
    const { deps } = withWorkflow({ skipped: "workbench/demo/DEMO-PLAN-F1.md is done (2026-10-20)" });

    // Act
    const outcome = await compactSession({ force: false }, deps);

    // Assert
    deepStrictEqual(outcome.state, { skipped: "workbench/demo/DEMO-PLAN-F1.md is done (2026-10-20)" });
    assertNoStatePointer(deps.session.messages);
  });
});
