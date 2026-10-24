// The compaction pipeline over the fakes of its ports. Run:
//   node --test src/shared/application/compaction/compact-session.test.ts
import { describe, it } from "node:test";
import { ok, deepStrictEqual, strictEqual } from "node:assert";

import { COMPACT_PROGRESS_LABEL, compactSession, readCompactionTrigger, snipBuffer } from "./compact-session.ts";
import {
  buildCompactedBuffer, buildMemoryExtractionPrompt, buildMemoryRecapMessage, buildRestoredFileMessage,
  buildRestoredSkillMessage, buildRestoredStateMessage, buildSummaryPrompt, buildTranscript,
} from "../../domain/compaction.ts";
import { SNIP_RETAIN_COUNT } from "../../domain/compaction-thresholds.ts";
import { SKILLS_STATE_KEY } from "../../domain/session-keys.ts";
import type { SessionMsg } from "../../domain/types.ts";
import { FakeFiles } from "../../../../tests/support/fake-files.ts";
import { FakeLlm } from "../../../../tests/support/fake-llm.ts";
import { FakeLogger } from "../../../../tests/support/fake-logger.ts";
import { FakeMemoryStore } from "../../../../tests/support/fake-memory-store.ts";
import { FakeProgress } from "../../../../tests/support/fake-progress.ts";
import { FakeSessionStore } from "../../../../tests/support/fake-session-store.ts";

const ABOVE = { used: 199_000, window: 200_000 };
const BELOW = { used: 1_200, window: 200_000 };

const HISTORY: SessionMsg[] = [
  { role: "system", content: "head" },
  { role: "user", content: "fix /workspace/src/a.ts" },
  { role: "assistant", content: "done" },
  { role: "user", content: "thanks" },
];

/** A session above the trigger with HISTORY, a model that answers, and every other port empty. */
function setup() {
  const session = new FakeSessionStore();
  session.messages = [...HISTORY];
  session.budget = ABOVE;
  const llm = new FakeLlm();
  llm.completions = ["SUMMARY"];
  llm.extractions = [{ items: [{ category: "project", content: "uses pnpm" }] }];
  const deps = {
    session, llm,
    progress: new FakeProgress(),
    files: new FakeFiles(),
    memory: new FakeMemoryStore(),
    log: new FakeLogger(),
  };
  return deps;
}

describe("compactSession: nothing to compact", () => {
  it("skips a buffer too small, without progress or model call", async () => {
    const deps = setup();
    deps.session.messages = HISTORY.slice(0, 2);
    deepStrictEqual(await compactSession({ force: true }, deps), { status: "skipped", reason: "buffer too small" });
    deepStrictEqual(deps.progress.reports, []);
    deepStrictEqual(deps.llm.extracts, []);
  });

  it("skips below the trigger when the run is threshold-gated, and only then", async () => {
    const deps = setup();
    deps.session.budget = BELOW;
    deepStrictEqual(await compactSession({ force: false }, deps), { status: "skipped", reason: "below trigger", usedTokens: BELOW.used });
    deepStrictEqual(deps.session.snips, []);
    strictEqual((await compactSession({ force: true }, deps)).status, "snipped");
  });
});

describe("compactSession: the full pipeline", () => {
  it("extracts memories, snips, summarises, restores files and skills, and rewrites the buffer", async () => {
    const deps = setup();
    deps.files.files.set("/workspace/src/a.ts", "export const a = 1;");
    deps.files.files.set("/workspace/skills/s.md", "# Skill");
    deps.session.state.set(SKILLS_STATE_KEY, `["/workspace/skills/s.md"]`);

    const outcome = await compactSession({ force: false }, deps);

    deepStrictEqual(outcome, { status: "compacted", before: 4, after: 6, usedTokens: ABOVE.used });
    const transcript = buildTranscript(HISTORY);
    deepStrictEqual(deps.llm.extracts.map((c) => c.prompt), [buildMemoryExtractionPrompt(transcript)]);
    deepStrictEqual(deps.memory.records.map((r) => [r.category, r.content]), [["project", "uses pnpm"]]);
    deepStrictEqual(deps.session.snips, [SNIP_RETAIN_COUNT]);
    const prompt = buildSummaryPrompt(transcript);
    deepStrictEqual(deps.llm.completes, [{ prompt: prompt.user, override: { system: prompt.system } }]);
    deepStrictEqual(deps.session.messages, [
      ...buildCompactedBuffer(HISTORY[0], "SUMMARY"),
      buildMemoryRecapMessage([{ category: "project", content: "uses pnpm" }]),
      buildRestoredFileMessage("/workspace/src/a.ts", "export const a = 1;"),
      buildRestoredSkillMessage("/workspace/skills/s.md", "# Skill"),
    ]);
    deepStrictEqual(deps.progress.reports.map((r) => [r.step, r.total, r.message]), [
      [1, 5, "extracting memories"],
      [2, 5, "micro-compacting (snip)"],
      [3, 5, "synthesizing the summary"],
      [4, 5, "restoring recent files"],
      [5, 5, "restoring attached skills"],
    ]);
    deepStrictEqual(deps.progress.released, [COMPACT_PROGRESS_LABEL]);
    deepStrictEqual(deps.log.lines, [
      "info: compaction path: full synthesis",
      "info: post-compaction restore: 1 file(s) re-injected",
      "info: post-compaction restore: 1 skill(s) re-injected",
    ]);
  });

  it("stops at the snip when it brought usage under the trigger: no summary is paid", async () => {
    const deps = setup();
    deps.session.budgetAfterSnip = BELOW;
    deepStrictEqual(await compactSession({ force: true }, deps), { status: "snipped", before: 4, usedTokens: BELOW.used });
    deepStrictEqual(deps.llm.completes, []);
    deepStrictEqual(deps.session.messages, HISTORY);
    deepStrictEqual(deps.memory.records.length, 1);
    deepStrictEqual(deps.progress.released, [COMPACT_PROGRESS_LABEL]);
  });

  it("compacts without memories when the extraction fails", async () => {
    const deps = setup();
    deps.llm.extractions = [new Error("not JSON")];
    const outcome = await compactSession({ force: true }, deps);
    strictEqual(outcome.status, "compacted");
    deepStrictEqual(deps.session.messages, buildCompactedBuffer(HISTORY[0], "SUMMARY"));
  });
});

describe("compactSession: the summary call", () => {
  it("passes the operator's focus to the summary prompt and keeps only what the markers enclose", async () => {
    const deps = setup();
    deps.llm.completions = ["Sure.\n<summary>1. The request: ship it</summary>\nAnything else?"];
    strictEqual((await compactSession({ force: true, focus: "the release steps" }, deps)).status, "compacted");
    ok(String(deps.llm.completes[0].override?.system).includes("keep above all: the release steps"));
    const summary = deps.session.messages.find((m) => String(m.content).startsWith("[compacted]"));
    ok(String(summary?.content).endsWith("\n1. The request: ship it"), String(summary?.content));
  });

  it("lists what memory already holds in the extraction prompt", async () => {
    const deps = setup();
    await deps.memory.add("project", "releases are cut from main");
    await compactSession({ force: true }, deps);
    ok(deps.llm.extracts[0].prompt.includes("- releases are cut from main"), deps.llm.extracts[0].prompt);
  });
});

describe("compactSession: failures are outcomes", () => {
  it("reports the model's failure, leaves the buffer and releases the progress", async () => {
    const deps = setup();
    deps.llm.completions = [new Error("model down")];
    deepStrictEqual(await compactSession({ force: true }, deps), { status: "failed", reason: "model down" });
    deepStrictEqual(deps.session.messages, HISTORY);
    deepStrictEqual(deps.progress.released, [COMPACT_PROGRESS_LABEL]);
  });

  it("fails on an empty summary rather than replace the history with nothing", async () => {
    const deps = setup();
    deps.llm.completions = ["<summary>   </summary>"];
    deepStrictEqual(await compactSession({ force: true }, deps), { status: "failed", reason: "the summary came back empty" });
    deepStrictEqual(deps.session.messages, HISTORY);
    deepStrictEqual(deps.progress.released, [COMPACT_PROGRESS_LABEL]);
  });

  it("reports a session that cannot be read", async () => {
    const deps = setup();
    deps.session.failure = new Error("session store down");
    deepStrictEqual(await compactSession({ force: true }, deps), { status: "failed", reason: "session store down" });
    deepStrictEqual(deps.progress.reports, []);
  });

  it("never fails over its log", async () => {
    const deps = setup();
    deps.log.info = () => { throw new Error("log closed"); };
    strictEqual((await compactSession({ force: true }, deps)).status, "compacted");
  });
});

describe("/compact --snip and the compaction.trigger setting", () => {
  it("snips to the head and the last exchanges, and says what it did", async () => {
    const session = new FakeSessionStore();
    session.snipped = { removed: 12, retained: 4 };
    strictEqual(await snipBuffer(3, { session }), "snipped: 12 removed, 4 kept.");
    deepStrictEqual(session.snips, [3]);
  });

  it("reads the setting as a token count, and nothing when it is unset or wrong", async () => {
    const store = (value: string | undefined) => ({ readValue: async (key: string) => ({ key, value, source: "file" as const }) });
    strictEqual(await readCompactionTrigger(store("90k")), 90_000);
    strictEqual(await readCompactionTrigger(store(undefined)), undefined);
    strictEqual(await readCompactionTrigger(store("soon")), undefined);
    strictEqual(await readCompactionTrigger({ readValue: async () => { throw new Error("down"); } }), undefined);
  });

  it("compacts at the trigger the setting gives", async () => {
    const deps = setup();
    deps.session.budget = { used: 50_000, window: 200_000 };
    strictEqual((await compactSession({ force: false }, deps)).status, "skipped", "below the computed trigger");
    strictEqual((await compactSession({ force: false, trigger: 40_000 }, deps)).status, "compacted");
  });
});

describe("compactSession: step 0, the state of the dev batch in progress", () => {
  const WRITTEN = { path: ".orkeon/dev/demo/state-F2.md", firstOpen: "Step 2 — Refuse" };

  /** setup() with a workflow writer that records its triggers and what the buffer held then. */
  function withWorkflow(result: unknown = WRITTEN) {
    const deps = setup();
    const calls: Array<{ trigger: string; extracted: number }> = [];
    const workflow = async (trigger: "manual" | "auto") => {
      calls.push({ trigger, extracted: deps.llm.extracts.length });
      if (result instanceof Error) throw result;
      return result as typeof WRITTEN | null;
    };
    return { deps: { ...deps, workflow }, calls };
  }

  it("writes the state before the extraction, then points at it last in the new buffer", async () => {
    const { deps, calls } = withWorkflow();
    const outcome = await compactSession({ force: false }, deps);
    deepStrictEqual(calls, [{ trigger: "auto", extracted: 0 }]);
    deepStrictEqual(outcome, { status: "compacted", before: 4, after: 5, usedTokens: ABOVE.used, state: { path: WRITTEN.path } });
    deepStrictEqual(deps.session.messages.at(-1), buildRestoredStateMessage(`/workspace/${WRITTEN.path}`, WRITTEN.firstOpen));
    ok(deps.log.lines.includes(`info: state of the batch in progress written to ${WRITTEN.path}`), JSON.stringify(deps.log.lines));
  });

  it("writes it on the snip-only path too, which leaves the buffer as the snip left it", async () => {
    const { deps, calls } = withWorkflow();
    deps.session.budgetAfterSnip = BELOW;
    const outcome = await compactSession({ force: true }, deps);
    deepStrictEqual(outcome, { status: "snipped", before: 4, usedTokens: BELOW.used, state: { path: WRITTEN.path } });
    deepStrictEqual(calls.map((c) => c.trigger), ["manual"]);
    deepStrictEqual(deps.session.messages, HISTORY);
  });

  it("writes it under /compact even on a buffer too small, and not below the trigger of an automatic run", async () => {
    const small = withWorkflow();
    small.deps.session.messages = HISTORY.slice(0, 2);
    deepStrictEqual(await compactSession({ force: true }, small.deps),
      { status: "skipped", reason: "buffer too small", state: { path: WRITTEN.path } });
    strictEqual(small.calls.length, 1);
    const below = withWorkflow();
    below.deps.session.budget = BELOW;
    strictEqual((await compactSession({ force: false }, below.deps)).status, "skipped");
    deepStrictEqual(below.calls, []);
  });

  it("goes on when the state cannot be written, saying so; no batch, no state and no pointer", async () => {
    const failing = withWorkflow(new Error("disk full\nmore"));
    const outcome = await compactSession({ force: false }, failing.deps);
    strictEqual(outcome.status, "compacted");
    deepStrictEqual(outcome.state, { skipped: "it could not be written (disk full)" });
    ok(failing.deps.log.lines.includes("warn: the state of the batch in progress could not be written: disk full"));
    ok(!failing.deps.session.messages.some((m) => String(m.content).startsWith("[restored-state]")));
    const none = withWorkflow(null);
    const plain = await compactSession({ force: false }, none.deps);
    strictEqual(plain.state, undefined);
    strictEqual(none.deps.session.messages.length, 4);
  });

  it("reports a skipped state in the outcome without pointing at any file", async () => {
    const { deps } = withWorkflow({ skipped: "workbench/demo/DEMO-PLAN-F1.md is done (2026-10-20)" });
    const outcome = await compactSession({ force: false }, deps);
    deepStrictEqual(outcome.state, { skipped: "workbench/demo/DEMO-PLAN-F1.md is done (2026-10-20)" });
    ok(!deps.session.messages.some((m) => String(m.content).startsWith("[restored-state]")));
  });
});
