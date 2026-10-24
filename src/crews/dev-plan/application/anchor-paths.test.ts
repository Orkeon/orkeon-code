// The anchors of a checked answer against listings: an existing path present, a created
// path absent, one listing per folder, each problem once. Run:
//   node --test src/crews/dev-plan/application/anchor-paths.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";

import { FakeFiles } from "../../../../tests/support/fake-files.ts";
import type { Files } from "../../../shared/application/ports.ts";
import type { PlanAnswer } from "../domain/plan-answer.ts";
import { MAX_ANCHOR_FOLDERS, checkAnchorPaths } from "./anchor-paths.ts";
import type { AnchorListings } from "./anchor-paths.ts";

const ANSWER = JSON.parse(readFileSync(new URL("../../../../tests/fixtures/dev/plan/answer.json", import.meta.url), "utf8")) as PlanAnswer;

function repository(): FakeFiles {
  const files = new FakeFiles();
  files.listings.set("/workspace/src/shared/domain", ["memory.ts", "dev/"]);
  files.listings.set("/workspace/docs", ["commands.md", "fr/"]);
  files.listings.set("/workspace/docs/fr", ["commands.md"]);
  return files;
}

class CountingFiles extends FakeFiles {
  listed: string[] = [];
  override async list(path: string, maxEntries: number): Promise<string[]> {
    this.listed.push(path);
    return super.list(path, maxEntries);
  }
}

describe("checkAnchorPaths", () => {
  it("accepts the golden answer: files to create absent, existing files present", async () => {
    deepStrictEqual(await checkAnchorPaths(repository(), ANSWER), []);
  });

  it("refuses an existing anchor that is absent and a create anchor that is present", async () => {
    const files = repository();
    files.listings.set("/workspace/docs/fr", []);
    files.listings.set("/workspace/src/shared/domain", ["memory.ts", "memory-prune.ts", "memory-prune.test.ts"]);
    deepStrictEqual(await checkAnchorPaths(files, ANSWER), [
      "B1 S1: src/shared/domain/memory-prune.test.ts exists: anchor it as existing, or by its ref",
      "B1 S1: src/shared/domain/memory-prune.ts exists: anchor it as existing, or by its ref",
      "B1 S2: src/shared/domain/memory-prune.test.ts exists: anchor it as existing, or by its ref",
      "B1 S2: src/shared/domain/memory-prune.ts exists: anchor it as existing, or by its ref",
      "B2 S1: docs/fr/commands.md does not exist",
    ]);
  });

  it("lists each folder once, and a listing that throws reads as empty", async () => {
    const files = new CountingFiles();
    files.listings.set("/workspace/docs", ["commands.md"]);
    files.listings.set("/workspace/src/shared/domain", []);
    const failing: Pick<Files, "list"> = {
      list: async (path, max) => {
        if (path === "/workspace/docs/fr") throw new Error("not found");
        return files.list(path, max);
      },
    };
    deepStrictEqual(await checkAnchorPaths(failing, ANSWER), ["B2 S1: docs/fr/commands.md does not exist"]);
    deepStrictEqual(files.listed, ["/workspace/src/shared/domain", "/workspace/docs"]);
  });

  it("refuses a path that holds a colon without listing its folder", async () => {
    const files = new CountingFiles();
    const step = ANSWER.batches[0].steps[0];
    const colon: PlanAnswer = {
      ...ANSWER,
      batches: [{ ...ANSWER.batches[0], steps: [{ ...step, anchors: { tests: [], doubles: [], production: [{ kind: "existing", path: "docs/commands.md:12" }] } }] }],
    };
    deepStrictEqual(await checkAnchorPaths(files, colon), ['B1 S1: anchor path "docs/commands.md:12" holds ":"']);
    deepStrictEqual(files.listed, []);
  });

  it("lists a folder once across the calls that share one listings map", async () => {
    const files = new CountingFiles();
    files.listings.set("/workspace/src/shared/domain", []);
    files.listings.set("/workspace/docs", ["commands.md", "fr/"]);
    files.listings.set("/workspace/docs/fr", ["commands.md"]);
    const listings: AnchorListings = new Map();
    deepStrictEqual(await checkAnchorPaths(files, ANSWER, listings), []);
    deepStrictEqual(await checkAnchorPaths(files, ANSWER, listings), []);
    deepStrictEqual(files.listed, ["/workspace/src/shared/domain", "/workspace/docs", "/workspace/docs/fr"]);
  });

  it("checks 40 folders at most, and refuses every existing anchor past them as not checked", async () => {
    const files = new CountingFiles();
    const step = ANSWER.batches[0].steps[0];
    const many: PlanAnswer = {
      ...ANSWER,
      batches: [{
        ...ANSWER.batches[0],
        steps: [{
          ...step,
          anchors: {
            tests: [], doubles: [],
            production: Array.from({ length: 45 }, (_, i) => ({ kind: "existing" as const, path: `d${i}/f.md` })),
          },
        }],
      }],
    };
    const problems = await checkAnchorPaths(files, many);
    ok(files.listed.length === MAX_ANCHOR_FOLDERS, `${files.listed.length}`);
    strictEqual(problems.length, 45);
    strictEqual(problems.filter((p) => p.endsWith("does not exist")).length, MAX_ANCHOR_FOLDERS);
    deepStrictEqual(problems.slice(MAX_ANCHOR_FOLDERS), [40, 41, 42, 43, 44].map((i) => `B1 S1: anchor "d${i}/f.md" not checked: more than 40 folders`));
  });
});
