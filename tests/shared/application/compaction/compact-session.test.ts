// The compaction pipeline over the fakes of its ports. Run:
//   node --test tests/shared/application/compaction/compact-session.test.ts
import { describe, it } from "node:test";
import { ok, deepStrictEqual, strictEqual } from "node:assert";

import { COMPACT_PROGRESS_LABEL, compactSession, readCompactionTrigger, snipBuffer } from "../../../../src/shared/application/compaction/compact-session.ts";
import {
  buildCompactedBuffer, buildMemoryExtractionPrompt, buildRestoredStateMessage, buildSummaryPrompt,
  buildTranscript,
} from "../../../../src/shared/domain/compaction.ts";
import { SKILLS_STATE_KEY } from "../../../../src/shared/domain/session-keys.ts";
import { FakeSessionStore } from "../../../support/doubles/fake-session-store.ts";
import {
  ABOVE, BELOW, FULL_PIPELINE_LOG, FULL_PIPELINE_STEPS, HISTORY, SNIPPED, TODAY, TRIGGER_SETTINGS, WRITTEN, compactSetup,
  PENDING_REQUEST, failingSummarySetup, fullPipelineBuffer, pendingRequestBuffer, snipFallbackBuffer, withWorkflow,
} from "./compact-session.fixtures.ts";
import { assertNoStatePointer, assertSnipFallback } from "./compact-session.assertions.ts";
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

  it("reads no message below the trigger when the run is threshold-gated", async () => {
    // Arrange
    const deps = compactSetup();
    deps.session.budget = BELOW;

    // Act
    await compactSession({ force: false }, deps);

    // Assert
    strictEqual(deps.session.readMessagesCalls, 0);
  });

  it("does not skip below the trigger when the run is forced", async () => {
    // Arrange
    const deps = compactSetup();
    deps.session.budget = BELOW;

    // Act
    const outcome = await compactSession({ force: true }, deps);

    // Assert
    strictEqual(outcome.status, "compacted");
    strictEqual(deps.llm.completes.length, 1);
  });
});

describe("compactSession: the full pipeline", () => {
  it("extracts memories, summarises, restores files and skills, and rewrites the buffer", async () => {
    // Arrange
    const deps = compactSetup();
    deps.files.files.set(`${WORKSPACE}/src/a.ts`, "export const a = 1;");
    deps.files.files.set(`${WORKSPACE}/skills/s.md`, "# Skill");
    deps.session.state.set(SKILLS_STATE_KEY, `["${WORKSPACE}/skills/s.md"]`);
    const prompt = buildSummaryPrompt(buildTranscript(HISTORY));

    // Act
    const outcome = await compactSession({ force: false }, deps);

    // Assert
    deepStrictEqual(outcome, { status: "compacted", before: 4, after: 6, usedTokens: ABOVE.used });
    deepStrictEqual(deps.memory.records.map((r) => [r.category, r.content]), [["project", "uses pnpm"]]);
    deepStrictEqual(deps.llm.completes, [{ prompt: prompt.user, override: { system: prompt.system } }]);
    deepStrictEqual(deps.session.messages, fullPipelineBuffer());
    deepStrictEqual(deps.progress.reports.map((r) => [r.step, r.total, r.message]), FULL_PIPELINE_STEPS);
    deepStrictEqual(deps.progress.released, [COMPACT_PROGRESS_LABEL]);
    deepStrictEqual(deps.log.lines, FULL_PIPELINE_LOG);
  });

  it("writes the summary from the whole buffer, the turns a snip would remove included", async () => {
    // Arrange
    const deps = compactSetup();
    deps.session.messagesAfterSnip = SNIPPED;
    const prompt = buildSummaryPrompt(buildTranscript(HISTORY));

    // Act
    await compactSession({ force: true }, deps);

    // Assert
    deepStrictEqual(deps.llm.completes.map((c) => c.prompt), [prompt.user]);
  });

  it("keeps the pending request and its turn context last after a compaction at the head of a turn", async () => {
    // Arrange
    const deps = compactSetup();
    deps.session.messages = [...HISTORY, ...PENDING_REQUEST];

    // Act
    await compactSession({ force: false }, deps);

    // Assert
    deepStrictEqual(deps.session.messages, pendingRequestBuffer());
  });

  it("does not snip the buffer when the summary is written", async () => {
    // Arrange
    const deps = compactSetup();

    // Act
    await compactSession({ force: true }, deps);

    // Assert
    deepStrictEqual(deps.session.snips, []);
  });

  it("gives the extraction the date the clock reads", async () => {
    // Arrange
    const deps = compactSetup();

    // Act
    await compactSession({ force: true }, deps);

    // Assert
    deepStrictEqual(deps.llm.extracts.map((c) => c.prompt), [buildMemoryExtractionPrompt(buildTranscript(HISTORY), [], TODAY)]);
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
  it("falls back to the snip and its notice when the model fails, and reports the failure", async () => {
    // Arrange
    const deps = failingSummarySetup(new Error("model down"));

    // Act
    const outcome = await compactSession({ force: true }, deps);

    // Assert
    assertSnipFallback(outcome, deps.session, "model down");
  });

  it("falls back to the snip and its notice on an empty summary rather than replace the history with nothing", async () => {
    // Arrange
    const deps = failingSummarySetup("<summary>   </summary>");

    // Act
    const outcome = await compactSession({ force: true }, deps);

    // Assert
    assertSnipFallback(outcome, deps.session, "the summary came back empty");
  });

  it("does not pile up a second notice when a second fallback snips a buffer that holds one", async () => {
    // Arrange
    const deps = failingSummarySetup(new Error("model down"));
    deps.session.messagesAfterSnip = snipFallbackBuffer();

    // Act
    await compactSession({ force: true }, deps);

    // Assert
    deepStrictEqual(deps.session.messages, snipFallbackBuffer());
  });

  it("reports no fallback when the snip removed nothing", async () => {
    // Arrange
    const deps = failingSummarySetup(new Error("model down"));
    deps.session.snipped = { removed: 0, retained: 4 };

    // Act
    const outcome = await compactSession({ force: true }, deps);

    // Assert
    deepStrictEqual(outcome, { status: "failed", reason: "model down" });
  });

  it("keeps the fallback when the snip removed turns but its notice could not be written, and logs it", async () => {
    // Arrange
    const deps = failingSummarySetup(new Error("model down"));
    deps.session.writeMessagesFailure = new Error("buffer locked");

    // Act
    const outcome = await compactSession({ force: true }, deps);

    // Assert
    deepStrictEqual(outcome, { status: "failed", reason: "model down", fallback: "snip" });
    ok(deps.log.lines.includes("info: the notice of the snip could not be written: buffer locked"), JSON.stringify(deps.log.lines));
  });

  it("releases the progress when the summary fails", async () => {
    // Arrange
    const deps = failingSummarySetup(new Error("model down"));

    // Act
    await compactSession({ force: true }, deps);

    // Assert
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
  it("snips to the head and the last messages, and says what it did", async () => {
    // Arrange
    const session = new FakeSessionStore();
    session.snipped = { removed: 12, retained: 4 };

    // Act
    const out = await snipBuffer(3, { session });

    // Assert
    strictEqual(out, "snipped: 12 removed, 4 kept.");
    deepStrictEqual(session.snips, [3]);
  });

  it("leaves the notice that the turns removed were not summarised right after the head, the last message still last", async () => {
    // Arrange
    const session = new FakeSessionStore();
    session.snipped = { removed: 2, retained: 2 };
    session.messagesAfterSnip = SNIPPED;

    // Act
    await snipBuffer(1, { session });

    // Assert
    deepStrictEqual(session.messages, snipFallbackBuffer());
  });

  it("does not add a second notice when one already follows the head", async () => {
    // Arrange
    const session = new FakeSessionStore();
    session.snipped = { removed: 2, retained: 3 };
    session.messagesAfterSnip = snipFallbackBuffer();

    // Act
    await snipBuffer(2, { session });

    // Assert
    deepStrictEqual(session.messages, snipFallbackBuffer());
  });

  it("leaves no notice when the snip removed nothing", async () => {
    // Arrange
    const session = new FakeSessionStore();
    session.messages = [...HISTORY];

    // Act
    await snipBuffer(10, { session });

    // Assert
    deepStrictEqual(session.messages, HISTORY);
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

  it("reports it when the summary fails and the buffer is snipped instead", async () => {
    // Arrange
    const { deps } = withWorkflow();
    deps.llm.completions = [new Error("model down")];
    deps.session.snipped = { removed: 2, retained: 2 };

    // Act
    const outcome = await compactSession({ force: true }, deps);

    // Assert
    deepStrictEqual(outcome, { status: "failed", reason: "model down", fallback: "snip", state: { path: WRITTEN.path } });
  });

  it("writes it under /compact even on a buffer too small", async () => {
    // Arrange
    const small = withWorkflow();
    small.deps.session.messages = HISTORY.slice(0, 2);

    // Act
    const outcome = await compactSession({ force: true }, small.deps);

    // Assert
    deepStrictEqual(outcome, { status: "skipped", reason: "buffer too small", state: { path: WRITTEN.path } });
    deepStrictEqual(small.calls.map((c) => c.trigger), ["manual"]);
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
