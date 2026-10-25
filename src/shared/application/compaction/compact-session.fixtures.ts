// The session, the fakes of the ports and the workflow writer compactSession is tested over.
import {
  buildCompactedBuffer, buildMemoryRecapMessage, buildRestoredFileMessage, buildRestoredSkillMessage,
} from "../../domain/compaction.ts";
import type { SessionMsg } from "../../domain/types.ts";
import { FakeFiles } from "../../../../tests/support/fake-files.ts";
import { FakeLlm } from "../../../../tests/support/fake-llm.ts";
import { FakeLogger } from "../../../../tests/support/fake-logger.ts";
import { FakeMemoryStore } from "../../../../tests/support/fake-memory-store.ts";
import { FakeProgress } from "../../../../tests/support/fake-progress.ts";
import { FakeSessionStore } from "../../../../tests/support/fake-session-store.ts";

export const ABOVE = { used: 199_000, window: 200_000 };
export const BELOW = { used: 1_200, window: 200_000 };

export const HISTORY: SessionMsg[] = [
  { role: "system", content: "head" },
  { role: "user", content: "fix /workspace/src/a.ts" },
  { role: "assistant", content: "done" },
  { role: "user", content: "thanks" },
];

/** A session above the trigger with HISTORY, a model that answers, and every other port empty. */
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
  };
  return deps;
}

/** The buffer after the full pipeline: the summary, the memory recap, the file and the skill restored. */
export function fullPipelineBuffer(): SessionMsg[] {
  return [
    ...buildCompactedBuffer(HISTORY[0], "SUMMARY"),
    buildMemoryRecapMessage([{ category: "project", content: "uses pnpm" }]),
    buildRestoredFileMessage("/workspace/src/a.ts", "export const a = 1;"),
    buildRestoredSkillMessage("/workspace/skills/s.md", "# Skill"),
  ];
}

/** The progress reports of the full pipeline, as [step, total, message]. */
export const FULL_PIPELINE_STEPS = [
  [1, 5, "extracting memories"],
  [2, 5, "micro-compacting (snip)"],
  [3, 5, "synthesizing the summary"],
  [4, 5, "restoring recent files"],
  [5, 5, "restoring attached skills"],
];

export const FULL_PIPELINE_LOG = [
  "info: compaction path: full synthesis",
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
