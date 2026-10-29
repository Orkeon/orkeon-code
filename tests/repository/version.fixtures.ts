// The files the version tests read: the repository's own manifests and pins, and its crews.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** A file of the repository, by its path relative to `tests/`. */
export const read = (rel: string): string => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf-8");

/** One full git commit: forty hexadecimal characters, the form `git rev-parse HEAD` prints. */
export const COMMIT_SHA = /^[0-9a-f]{40}$/;

/** The folder of the crews and probes. */
export const CREWS_DIR = fileURLToPath(new URL("../../src/crews/", import.meta.url));

/** Every `.ork.ts` under `dir`, as a path relative to it. */
export function orkScripts(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf-8" }).filter((f: string) => f.endsWith(".ork.ts"));
}

/** The first line of each script, by its path relative to `dir`. */
export function firstLines(dir: string, scripts: readonly string[]): Map<string, string> {
  return new Map(scripts.map((f) => [f, readFileSync(join(dir, f), "utf-8").split("\n")[0]]));
}
