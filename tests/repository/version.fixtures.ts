// The files the version tests read: the repository's own manifests and pins, and its crews.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** A file of the repository, by its path relative to `tests/`. */
export const read = (rel: string): string => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf-8");

/** One exact Orkeon version: `1.2.3`, with an optional prerelease (`-rc.6`). */
export const EXACT_VERSION = /^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/;

/** The folder of the crews and probes. */
export const CREWS_DIR = fileURLToPath(new URL("../../src/crews/", import.meta.url));

/** The folder of the sources. */
export const SRC_DIR = fileURLToPath(new URL("../../src/", import.meta.url));

/** The task-builder members the typings carry from Orkeon `main` after #234 (`decision`, `when`, ADR 0010) that the
 *  pinned release, `1.0.0-rc.6` tagged at #232, does not ship: a call typechecks and fails on the pinned runtime. */
export const UNSHIPPED_TASK_MEMBERS: readonly string[] = ["decision", "when"];

/** Every runtime `.ts` under `dir` (no `.d.ts`), as a path relative to it. */
export function runtimeSources(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf-8" })
    .filter((f: string) => f.endsWith(".ts") && !f.endsWith(".d.ts"));
}

/** The files of `dir` whose text calls `.<member>(`, by member. */
export function callsTo(dir: string, files: readonly string[], members: readonly string[]): Map<string, string[]> {
  const found = new Map<string, string[]>(members.map((m) => [m, []]));
  for (const f of files) {
    const text = readFileSync(join(dir, f), "utf-8");
    for (const m of members) if (new RegExp(`\\.${m}\\(`).test(text)) found.get(m)!.push(f);
  }
  return found;
}

/** Every `.ork.ts` under `dir`, as a path relative to it. */
export function orkScripts(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf-8" }).filter((f: string) => f.endsWith(".ork.ts"));
}

/** The first line of each script, by its path relative to `dir`. */
export function firstLines(dir: string, scripts: readonly string[]): Map<string, string> {
  return new Map(scripts.map((f) => [f, readFileSync(join(dir, f), "utf-8").split("\n")[0]]));
}
