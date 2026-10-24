// What /dev-learn reads before it judges anything: every verdict file of the work
// folder (shared/application/dev/verdict-sources.ts), the two learning states and the
// refused motifs. It reads only; a file that cannot be read becomes a warning, never a failure.
import type { Files } from "../../../shared/application/ports.ts";
import type { WorkFolder } from "../../../shared/application/dev/resolve-work-folder.ts";
import { collectLearnRows, untreated as untreatedRows } from "../../../shared/domain/shared-memory/verdict-rows.ts";
import type { LearnRow } from "../../../shared/domain/shared-memory/verdict-rows.ts";
import { readVerdictSources } from "../../../shared/application/dev/verdict-sources.ts";
import {
  HARNESS_LEARN_STATE_FILE, LEARN_STATE_FILE, emptyLearnState, parseHarnessLearnState, parseLearnState,
} from "../../../shared/domain/dev/learn-state.ts";
import type { HarnessLearnState, LearnState } from "../../../shared/domain/dev/learn-state.ts";
import { REFUSED_FILE, parseRefused } from "../../../shared/domain/shared-memory/refused.ts";
import type { RefusedMotif } from "../../../shared/domain/shared-memory/refused.ts";

export { FOLDER_LIST_CAP, WORK_LIST_CAP } from "../../../shared/application/dev/verdict-sources.ts";
const WORKSPACE = "/workspace";

export interface Backlog {
  rows: LearnRow[];            // every row, collected (§ 1.3)
  untreated: LearnRow[];
  files: number;
  orkeon: LearnState; harness: HarnessLearnState; refused: RefusedMotif[];
  refusedFile: string;         // refused.md under memory.dir, relative to the project
  warnings: string[];
}

/** The file's text, or null when it cannot be read (an absent file reads as absent). */
async function readOrNull(files: Pick<Files, "read">, path: string): Promise<string | null> {
  try {
    return await files.read(path);
  } catch {
    return null;
  }
}

/** `refusedFile`: refused.md under memory.dir, relative to the project (readRefusedFile). */
export async function readBacklog(files: Pick<Files, "read" | "list">, work: WorkFolder, refusedFile: string = REFUSED_FILE): Promise<Backlog> {
  const { sources, warnings } = await readVerdictSources(files, work);
  const rows = collectLearnRows(sources);

  let orkeon = emptyLearnState();
  const read = parseLearnState(await readOrNull(files, `${WORKSPACE}/${LEARN_STATE_FILE}`));
  if (read.ok) orkeon = read.state;
  else warnings.push(read.problem);

  const harness = parseHarnessLearnState(await readOrNull(files, `${WORKSPACE}/${HARNESS_LEARN_STATE_FILE}`));

  const refusedText = await readOrNull(files, `${WORKSPACE}/${refusedFile}`);
  const list = refusedText === null ? { motifs: [], problems: [] } : parseRefused(refusedText);
  for (const p of list.problems) warnings.push(`${refusedFile}:${p.message}`);

  const treated = new Set([...orkeon.treated, ...harness.treated]);
  return {
    rows, untreated: untreatedRows(rows, treated), files: sources.length,
    orkeon, harness, refused: list.motifs, refusedFile, warnings,
  };
}
