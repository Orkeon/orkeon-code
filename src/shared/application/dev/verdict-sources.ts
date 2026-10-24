// Every verdict file of the work folder (one listing per code folder, hidden folders skipped as the harness's
// learning script skips them), read as VerdictSource for collectLearnRows: what /dev-learn's backlog and the
// shared memory's harvest after a GAPS verdict both read. It reads only; a file that cannot be read becomes a
// warning, never a failure.
import type { Files } from "../ports.ts";
import type { WorkFolder } from "./resolve-work-folder.ts";
import { LEARN_FILE } from "../../domain/shared-memory/verdict-rows.ts";
import type { VerdictSource } from "../../domain/shared-memory/verdict-rows.ts";

export const WORK_LIST_CAP = 1000;
export const FOLDER_LIST_CAP = 500;

const firstLine = (e: unknown): string => (e instanceof Error ? e.message : String(e)).split("\n")[0];
const bare = (entry: string): string => entry.replace(/\/+$/, "");

async function listOrEmpty(files: Pick<Files, "list">, path: string, cap: number): Promise<string[]> {
  try {
    return await files.list(path, cap);
  } catch {
    return [];
  }
}

export async function readVerdictSources(
  files: Pick<Files, "read" | "list">, work: Pick<WorkFolder, "folder" | "vfsPath">,
): Promise<{ sources: VerdictSource[]; warnings: string[] }> {
  const warnings: string[] = [];
  const sources: VerdictSource[] = [];
  if (work.vfsPath === null) return { sources, warnings };
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
  return { sources, warnings };
}
