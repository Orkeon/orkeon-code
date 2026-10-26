// The golden plan answer, a repository of listings and the doubles the checkAnchorPaths tests read.
import { readFileSync } from "node:fs";

import { FakeFiles } from "../../../support/doubles/fake-files.ts";
import type { PlanAnswer } from "../../../../src/crews/dev-plan/domain/plan-answer.ts";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";

export const ANSWER = JSON.parse(readFileSync(new URL("../../../fixtures/dev/plan/answer.json", import.meta.url), "utf8")) as PlanAnswer;

/** The repository the golden answer is right against (every folder listed in `listed`). */
export function repository(): FakeFiles {
  const files = new FakeFiles();
  files.listings.set(`${WORKSPACE}/src/shared/domain`, ["memory.ts", "dev/"]);
  files.listings.set(`${WORKSPACE}/docs`, ["commands.md", "fr/"]);
  files.listings.set(`${WORKSPACE}/docs/fr`, ["commands.md"]);
  return files;
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
