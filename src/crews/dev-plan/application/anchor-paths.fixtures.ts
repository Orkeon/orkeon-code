// The golden plan answer, a repository of listings and the doubles the checkAnchorPaths tests read.
import { readFileSync } from "node:fs";

import { FakeFiles } from "../../../../tests/support/fake-files.ts";
import type { Files } from "../../../shared/application/ports.ts";
import type { PlanAnswer } from "../domain/plan-answer.ts";
import { WORKSPACE } from "../../../shared/domain/dev/path-rebase.ts";

export const ANSWER = JSON.parse(readFileSync(new URL("../../../../tests/fixtures/dev/plan/answer.json", import.meta.url), "utf8")) as PlanAnswer;

/** FakeFiles that records every folder it lists. */
export class CountingFiles extends FakeFiles {
  listed: string[] = [];
  override async list(path: string, maxEntries: number): Promise<string[]> {
    this.listed.push(path);
    return super.list(path, maxEntries);
  }
}

/** Fills `files` with the listings the golden answer is right against. */
function fillRepository<T extends FakeFiles>(files: T): T {
  files.listings.set(`${WORKSPACE}/src/shared/domain`, ["memory.ts", "dev/"]);
  files.listings.set(`${WORKSPACE}/docs`, ["commands.md", "fr/"]);
  files.listings.set(`${WORKSPACE}/docs/fr`, ["commands.md"]);
  return files;
}

/** The repository the golden answer is right against. */
export function repository(): FakeFiles {
  return fillRepository(new FakeFiles());
}

/** The same repository, counting what it lists. */
export function countingRepository(): CountingFiles {
  return fillRepository(new CountingFiles());
}

/** A Files that throws on listing `path` and hands every other listing to `files`. */
export function throwingOn(files: Files, path: string): Pick<Files, "list"> {
  return {
    list: async (p, max) => {
      if (p === path) throw new Error("not found");
      return files.list(p, max);
    },
  };
}

/** The golden answer cut to its first step, anchored on the existing production paths given only. */
export function answerWithExisting(paths: readonly string[]): PlanAnswer {
  const step = ANSWER.batches[0].steps[0];
  return {
    ...ANSWER,
    batches: [{
      ...ANSWER.batches[0],
      steps: [{ ...step, anchors: { tests: [], doubles: [], production: paths.map((path) => ({ kind: "existing" as const, path })) } }],
    }],
  };
}

/** 45 existing anchors, each in a folder of its own. */
export const FORTY_FIVE_FOLDERS: readonly string[] = Array.from({ length: 45 }, (_, i) => `d${i}/f.md`);

export const CREATE_ANCHORS_PRESENT_PROBLEMS: readonly string[] = [
  "B1 S1: src/shared/domain/memory-prune.test.ts exists: anchor it as existing, or by its ref",
  "B1 S1: src/shared/domain/memory-prune.ts exists: anchor it as existing, or by its ref",
  "B1 S2: src/shared/domain/memory-prune.test.ts exists: anchor it as existing, or by its ref",
  "B1 S2: src/shared/domain/memory-prune.ts exists: anchor it as existing, or by its ref",
  "B2 S1: docs/fr/commands.md does not exist",
];
