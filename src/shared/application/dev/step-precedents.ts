// Code-triggered recall (lot M-6, temp/05 § 4.1): a dev step asks the shared memory for precedents at a fixed
// point of its own code - never a tool the model may forget - and puts the "## Precedents" block in the prompt it
// builds. Each trigger asks for the types its moment needs, with a query built from what the step already holds.
// Best effort: a recall that cannot run (no index, unreadable settings, a session rule that denies memory_recall)
// costs the block, never the step. The settings are read once per run, at the first recall.

import type { ConfigStore } from "../config-store.ts";
import type { Files, Logger, SharedMemory, Shell } from "../ports.ts";
import type { EntryType } from "../../domain/shared-memory/entry.ts";
import { buildPrecedentsBlock } from "../../domain/shared-memory/precedents-block.ts";
import { recallEntries } from "../shared-memory/recall-precedents.ts";
import { readMemorySettings } from "../shared-memory/memory-settings.ts";
import type { MemorySettings } from "../shared-memory/memory-settings.ts";

/** T1 spec or change start, T2 plan start, T3 before a batch's red tests, T4 before the audit, T5 a correction. */
export type RecallTrigger = "T1" | "T2" | "T3" | "T4" | "T5";

export const TRIGGER_TYPES: Readonly<Record<RecallTrigger, readonly EntryType[]>> = {
  T1: ["decision", "method"],
  T2: ["decision", "code-structure"],
  T3: ["code-structure", "mistake"],
  T4: ["mistake"],
  T5: ["mistake"],
};

/** A query is a few hundred characters: the index embeds it, a longer one only dilutes it. */
export const MAX_RECALL_QUERY_CHARS = 400;

export interface Recalled {
  /** The "## Precedents" block, or "" when nothing was recalled. */
  block: string;
  /** The ids recalled (a bound may leave some out of the block, which counts them): the step's end message names them. */
  ids: string[];
}

export const NOTHING_RECALLED: Recalled = { block: "", ids: [] };

/** What a dev step calls: the precedents of one trigger for one query. Never throws. */
export type StepPrecedents = (trigger: RecallTrigger, query: string) => Promise<Recalled>;

/** The step that recalls nothing: a test's default, and the crew's when memory_recall is denied. */
export const noPrecedents: StepPrecedents = async () => NOTHING_RECALLED;

/** The query of a trigger: the parts in order, each line's spaces collapsed, blank ones dropped, cut at the bound. */
export function recallQuery(parts: readonly string[]): string {
  const text = parts.map((p) => p.replace(/\s+/g, " ").trim()).filter((p) => p !== "").join(" — ");
  return text.length <= MAX_RECALL_QUERY_CHARS ? text : text.slice(0, MAX_RECALL_QUERY_CHARS).trimEnd();
}

/** A sheet's or a plan's title: its first "# " heading, "" when none. */
export function sheetTitle(text: string): string {
  const line = text.split("\n").find((l) => l.startsWith("# "));
  return line === undefined ? "" : line.slice(2).trim();
}

export interface StepPrecedentsDeps {
  memory: Pick<SharedMemory, "search">;
  files: Pick<Files, "read">;
  config: Pick<ConfigStore, "readValue">;
  shell: Pick<Shell, "run">;
  log: Pick<Logger, "warn">;
}

const firstLine = (e: unknown): string => String((e as Error)?.message ?? e).split("\n")[0];

/** The recall of one run of a step; `on: false` (a session rule denies memory_recall) recalls nothing. */
export function stepPrecedents(deps: StepPrecedentsDeps, options: { on: boolean }): StepPrecedents {
  if (!options.on) return noPrecedents;
  let settings: Promise<MemorySettings> | null = null;
  return async (trigger, query) => {
    try {
      settings ??= readMemorySettings(deps);
      const memory = await settings;
      const recall = await recallEntries(deps, { memory, query, types: TRIGGER_TYPES[trigger] });
      const block = buildPrecedentsBlock(recall.precedents);
      return block === "" ? NOTHING_RECALLED : { block, ids: recall.precedents.map((p) => p.entry.id) };
    } catch (error) {
      settings = null; // a failed read is tried again at the next trigger, not kept for the run
      deps.log.warn(`shared memory: recall ${trigger} failed, no precedents (${firstLine(error)})`);
      return NOTHING_RECALLED;
    }
  };
}

/** The end-message line of a step that recalled: "" when nothing was. */
export function precedentsLine(recalled: readonly Recalled[]): string {
  const ids = [...new Set(recalled.flatMap((r) => r.ids))];
  return ids.length === 0 ? "" : `precedents recalled: ${ids.join(", ")}`;
}
