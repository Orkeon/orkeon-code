// What /dev-learn reads before it judges anything: every verdict file of the work
// folder (one listing per code folder, hidden folders skipped as the harness's script
// skips them), the two learning states and the refused motifs. It reads only; a file
// that cannot be read becomes a warning, never a failure.
import type { Files } from "../../../shared/application/ports.ts";
import type { WorkFolder } from "../../../shared/application/dev/resolve-work-folder.ts";
import { LEARN_FILE, collectLearnRows, untreated as untreatedRows } from "../../../shared/domain/shared-memory/verdict-rows.ts";
import type { LearnRow, VerdictSource } from "../../../shared/domain/shared-memory/verdict-rows.ts";
import {
  HARNESS_LEARN_STATE_FILE, LEARN_STATE_FILE, emptyLearnState, parseHarnessLearnState, parseLearnState,
} from "../../../shared/domain/dev/learn-state.ts";
import type { HarnessLearnState, LearnState } from "../../../shared/domain/dev/learn-state.ts";
import { REFUSED_FILE, parseRefused } from "../../../shared/domain/shared-memory/refused.ts";
import type { RefusedMotif } from "../../../shared/domain/shared-memory/refused.ts";

export const WORK_LIST_CAP = 1000;
export const FOLDER_LIST_CAP = 500;
const WORKSPACE = "/workspace";

export interface Backlog {
  rows: LearnRow[];            // every row, collected (§ 1.3)
  untreated: LearnRow[];
  files: number;
  orkeon: LearnState; harness: HarnessLearnState; refused: RefusedMotif[];
  warnings: string[];
}

const firstLine = (e: unknown): string => (e instanceof Error ? e.message : String(e)).split("\n")[0];
const bare = (entry: string): string => entry.replace(/\/+$/, "");

async function listOrEmpty(files: Pick<Files, "list">, path: string, cap: number): Promise<string[]> {
  try {
    return await files.list(path, cap);
  } catch {
    return [];
  }
}

/** The file's text, or null when it cannot be read (an absent file reads as absent). */
async function readOrNull(files: Pick<Files, "read">, path: string): Promise<string | null> {
  try {
    return await files.read(path);
  } catch {
    return null;
  }
}

export async function readBacklog(files: Pick<Files, "read" | "list">, work: WorkFolder): Promise<Backlog> {
  const warnings: string[] = [];
  const sources: VerdictSource[] = [];
  if (work.vfsPath !== null) {
    const entries = await listOrEmpty(files, work.vfsPath, WORK_LIST_CAP);
    for (const code of entries.map(bare).filter((e) => e !== "" && !e.startsWith("."))) {
      const names = (await listOrEmpty(files, `${work.vfsPath}/${code}`, FOLDER_LIST_CAP)).map(bare);
      if (names.length >= FOLDER_LIST_CAP) {
        warnings.push(`${work.folder}/${code}/ lists ${FOLDER_LIST_CAP} entries or more: later files are not read`);
      }
      for (const name of names.filter((n) => LEARN_FILE.test(n))) {
        try {
          sources.push({ code, name, text: await files.read(`${work.vfsPath}/${code}/${name}`) });
        } catch (error) {
          warnings.push(`${work.folder}/${code}/${name} cannot be read (${firstLine(error)})`);
        }
      }
    }
    if (entries.length >= WORK_LIST_CAP) {
      warnings.push(`${work.folder}/ lists ${WORK_LIST_CAP} entries or more: later folders are not read`);
    }
  }
  const rows = collectLearnRows(sources);

  let orkeon = emptyLearnState();
  const read = parseLearnState(await readOrNull(files, `${WORKSPACE}/${LEARN_STATE_FILE}`));
  if (read.ok) orkeon = read.state;
  else warnings.push(read.problem);

  const harness = parseHarnessLearnState(await readOrNull(files, `${WORKSPACE}/${HARNESS_LEARN_STATE_FILE}`));

  const refusedText = await readOrNull(files, `${WORKSPACE}/${REFUSED_FILE}`);
  const list = refusedText === null ? { motifs: [], problems: [] } : parseRefused(refusedText);
  for (const p of list.problems) warnings.push(`${REFUSED_FILE}:${p.message}`);

  const treated = new Set([...orkeon.treated, ...harness.treated]);
  return {
    rows, untreated: untreatedRows(rows, treated), files: sources.length,
    orkeon, harness, refused: list.motifs, warnings,
  };
}
