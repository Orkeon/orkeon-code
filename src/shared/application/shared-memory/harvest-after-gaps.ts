// After a GAPS verdict (lot M-7, temp/05 § 8 row M-7): every verdict file of the work folder is read again, the
// mistakes that recur in three batches become candidates under memory.dir (harvestMistakes: refused topics and
// topics a candidate or an entry holds are left out), and when untreated gaps span two batches or more the step
// says /dev-learn is due, as the harness's learning script nudges (--count). Candidates only: nothing is admitted
// without /memory-admit. Best effort: a failure costs the lines, never the verdict already written.

import type { ConfigStore } from "../config-store.ts";
import type { Files, Logger, Shell } from "../ports.ts";
import type { WorkFolder } from "../dev/resolve-work-folder.ts";
import { readVerdictSources } from "../dev/verdict-sources.ts";
import {
  HARNESS_LEARN_STATE_FILE, LEARN_STATE_FILE, parseHarnessLearnState, parseLearnState,
} from "../../domain/dev/learn-state.ts";
import { NUDGE_BATCHES, collectLearnRows, untreated } from "../../domain/shared-memory/verdict-rows.ts";
import type { LearnRow } from "../../domain/shared-memory/verdict-rows.ts";
import { harvestMistakes } from "./harvest-mistakes.ts";
import { readMemorySettings } from "./memory-settings.ts";
import { readOrNull } from "./memory-files.ts";

const WORKSPACE = "/workspace";

export interface AfterGapsDeps {
  files: Pick<Files, "read" | "write" | "list">;
  shell: Pick<Shell, "run">;
  config: Pick<ConfigStore, "readValue">;
  clock: () => Date;
  log: Pick<Logger, "warn">;
}

const firstLine = (e: unknown): string => String((e as Error)?.message ?? e).split("\n")[0];
const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** The rows /dev-learn has not treated, by either learning state (an unreadable state treats nothing). */
async function untreatedRows(files: Pick<Files, "read">, rows: readonly LearnRow[]): Promise<LearnRow[]> {
  const own = parseLearnState(await readOrNull(files, `${WORKSPACE}/${LEARN_STATE_FILE}`).catch(() => null));
  const harness = parseHarnessLearnState(await readOrNull(files, `${WORKSPACE}/${HARNESS_LEARN_STATE_FILE}`).catch(() => null));
  return untreated(rows, new Set([...(own.ok ? own.state.treated : []), ...harness.treated]));
}

/** The nudge line, "" below NUDGE_BATCHES distinct batches. */
export function learnNudge(rows: readonly LearnRow[]): string {
  const batches = new Set(rows.map((r) => r.batch)).size;
  if (batches < NUDGE_BATCHES) return "";
  return `→ ${plural(rows.length, "untreated verdict gap", "untreated verdict gaps")} across ${batches} batches: /dev-learn ` +
    "turns those that recur into rules (in a fresh session).";
}

/** The lines the verdict's end message adds: the candidates harvested, the nudge; none when there is nothing to say. */
export async function harvestAfterGaps(deps: AfterGapsDeps, work: Pick<WorkFolder, "folder" | "vfsPath">): Promise<string[]> {
  try {
    const read = await readVerdictSources(deps.files, work);
    for (const w of read.warnings) deps.log.warn(`shared memory: ${w}`);
    const rows = collectLearnRows(read.sources);
    if (rows.length === 0) return [];
    const lines: string[] = [];
    const settings = await readMemorySettings(deps);
    for (const w of settings.warnings) deps.log.warn(`shared memory: ${w}`);
    const harvest = await harvestMistakes(deps, settings, rows);
    for (const s of harvest.skipped) deps.log.warn(`shared memory: harvest: ${s}`);
    if (harvest.written.length > 0) {
      lines.push(
        `shared memory: ${plural(harvest.written.length, "mistake candidate", "mistake candidates")} harvested from the audits ` +
          `(${harvest.written.join(", ")}) → /memory-admit decides each one.`,
      );
    }
    const nudge = learnNudge(await untreatedRows(deps.files, rows));
    if (nudge !== "") lines.push(nudge);
    return lines;
  } catch (error) {
    deps.log.warn(`shared memory: harvest after the verdict failed (${firstLine(error)})`);
    return [];
  }
}
