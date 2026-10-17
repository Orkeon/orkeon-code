// The compaction pipeline over the fakes of its ports. Run:
//   node --test src/shared/application/compaction/compact-session.test.ts
import { describe, it } from "node:test";
import { ok, deepStrictEqual, strictEqual } from "node:assert";

import { COMPACT_PROGRESS_LABEL, compactSession } from "./compact-session.ts";
import {
  buildCompactedBuffer, buildMemoryExtractionPrompt, buildMemoryRecapMessage, buildRestoredFileMessage,
  buildRestoredSkillMessage, buildSummaryPrompt, buildTranscript,
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
