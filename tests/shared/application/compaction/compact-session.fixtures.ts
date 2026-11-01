// The session, the fakes of the ports and the workflow writer compactSession is tested over.
import {
  buildCompactedBuffer, buildMemoryRecapMessage, buildRestoredFileMessage, buildRestoredSkillMessage, buildSnipNoticeMessage,
} from "../../../../src/shared/domain/compaction.ts";
import type { SessionMsg } from "../../../../src/shared/domain/types.ts";
import { FakeClock } from "../../../support/doubles/fake-clock.ts";
import { FakeFiles } from "../../../support/doubles/fake-files.ts";
import { FakeLlm } from "../../../support/doubles/fake-llm.ts";
import { FakeLogger } from "../../../support/doubles/fake-logger.ts";
import { FakeMemoryStore } from "../../../support/doubles/fake-memory-store.ts";
import { FakeProgress } from "../../../support/doubles/fake-progress.ts";
import { FakeSessionStore } from "../../../support/doubles/fake-session-store.ts";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";
import { isoDay } from "../../../../src/shared/domain/iso-day.ts";

export const ABOVE = { used: 199_000, window: 200_000 };
export const BELOW = { used: 1_200, window: 200_000 };

/** A buffer at the tail of a turn: it ends on the answer, so no request waits. */
export const HISTORY: SessionMsg[] = [
  { role: "system", content: "head" },
  { role: "user", content: `fix ${WORKSPACE}/src/a.ts` },
  { role: "system", content: "[tools] The tool calls of the answer below:\n- edit_file" },
  { role: "assistant", content: "done" },
];

/** The request a turn stored before its head-of-turn compaction, its [turn-context] just before it. */
export const PENDING_REQUEST: SessionMsg[] = [
  { role: "user", content: "[turn-context] Context the turn-start checks added:\nsession resumed" },
  { role: "user", content: "now add a test" },
];

/** What the snip leaves of HISTORY: the head and the last message, the request in between removed. */
export const SNIPPED: SessionMsg[] = [HISTORY[0], HISTORY[3]];

/** The date FakeClock reads by default, as the extraction is given it: its UTC day, as the Environment line. */
export const TODAY = isoDay(new Date(new FakeClock().at));

/** A session above the trigger with HISTORY, a model that answers, a clock, and every other port empty. */
export function compactSetup() {
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
    clock: new FakeClock().now,
  };
  return deps;
}

/** compactSetup() whose summary call answers `reply` (an Error is thrown), and whose snip leaves SNIPPED. */
export function failingSummarySetup(reply: string | Error) {
  const deps = compactSetup();
  deps.llm.completions = [reply];
  deps.session.snipped = { removed: 2, retained: 2 };
  deps.session.messagesAfterSnip = SNIPPED;
  return deps;
}

/** The buffer the fallback leaves: the head, the notice that nothing was summarised, then the rest the snip kept. */
export function snipFallbackBuffer(): SessionMsg[] {
  return [SNIPPED[0], buildSnipNoticeMessage(), ...SNIPPED.slice(1)];
}

/** The buffer after the full pipeline: the summary, the memory recap, the file and the skill restored. */
export function fullPipelineBuffer(): SessionMsg[] {
  return [
    ...buildCompactedBuffer(HISTORY[0], "SUMMARY"),
    buildMemoryRecapMessage([{ category: "project", content: "uses pnpm" }]),
    buildRestoredFileMessage(`${WORKSPACE}/src/a.ts`, "export const a = 1;"),
    buildRestoredSkillMessage(`${WORKSPACE}/skills/s.md`, "# Skill"),
  ];
}

/** The buffer a head-of-turn compaction leaves: the summary and the memory recap, then the request still waiting. */
export function pendingRequestBuffer(): SessionMsg[] {
  return [
    ...buildCompactedBuffer(HISTORY[0], "SUMMARY"),
    buildMemoryRecapMessage([{ category: "project", content: "uses pnpm" }]),
    ...PENDING_REQUEST,
  ];
}

/** The progress reports of the full pipeline, as [step, total, message]. */
export const FULL_PIPELINE_STEPS = [
  [1, 4, "extracting memories"],
  [2, 4, "synthesizing the summary"],
  [3, 4, "restoring recent files"],
  [4, 4, "restoring attached skills"],
];

export const FULL_PIPELINE_LOG = [
  "info: post-compaction restore: 1 file(s) re-injected",
  "info: post-compaction restore: 1 skill(s) re-injected",
];

/** A config store whose compaction.trigger reads `value`. */
export const triggerStore = (value: string | undefined) => ({
  readValue: async (key: string) => ({ key, value, source: "file" as const }),
});

/** A config store that cannot be read. */
export const DOWN_STORE = { readValue: async (): Promise<never> => { throw new Error("down"); } };

export interface TriggerCase {
  name: string;
  store: { readValue: (key: string) => Promise<{ key: string; value: string | undefined; source: "file" }> };
  trigger: number | undefined;
}

/** The setting read as a token count, and nothing when it is unset or wrong. */
export const TRIGGER_SETTINGS: readonly TriggerCase[] = [
  { name: "reads 90k as a token count", store: triggerStore("90k"), trigger: 90_000 },
  { name: "reads nothing when it is unset", store: triggerStore(undefined), trigger: undefined },
  { name: "reads nothing when it is wrong", store: triggerStore("soon"), trigger: undefined },
  { name: "reads nothing when the store fails", store: DOWN_STORE, trigger: undefined },
];

export const WRITTEN = { path: ".orkeon/dev/demo/state-F2.md", firstOpen: "Step 2 — Refuse" };

/** compactSetup() with a workflow writer that records its triggers and what the buffer held then. */
export function withWorkflow(result: unknown = WRITTEN) {
  const deps = compactSetup();
  const calls: Array<{ trigger: string; extracted: number }> = [];
  const workflow = async (trigger: "manual" | "auto") => {
    calls.push({ trigger, extracted: deps.llm.extracts.length });
    if (result instanceof Error) throw result;
    return result as typeof WRITTEN | null;
  };
  return { deps: { ...deps, workflow }, calls };
}
