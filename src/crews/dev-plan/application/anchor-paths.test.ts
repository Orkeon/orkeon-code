// The anchors of a checked answer against listings: an existing path present, a created
// path absent, one listing per folder, each problem once. Run:
//   node --test src/crews/dev-plan/application/anchor-paths.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { LIST_CAP, MAX_ANCHOR_FOLDERS, checkAnchorPaths } from "./anchor-paths.ts";
import type { AnchorListings } from "./anchor-paths.ts";
import { FakeFiles } from "../../../../tests/support/doubles/fake-files.ts";
import {
  ANSWER, CREATE_ANCHORS_PRESENT_PROBLEMS, FORTY_FIVE_FOLDERS, answerWithExisting, repository, throwingOn,
} from "./anchor-paths.fixtures.ts";
import { WORKSPACE } from "../../../shared/domain/vfs.ts";

describe("checkAnchorPaths", () => {
  it("accepts the golden answer: files to create absent, existing files present", async () => {
    // Arrange
    const files = repository();

    // Act
    const problems = await checkAnchorPaths(files, ANSWER);

    // Assert
    deepStrictEqual(problems, []);
  });

  it("refuses an existing anchor that is absent and a create anchor that is present", async () => {
    // Arrange
    const files = repository();
    files.listings.set(`${WORKSPACE}/docs/fr`, []);
    files.listings.set(`${WORKSPACE}/src/shared/domain`, ["memory.ts", "memory-prune.ts", "memory-prune.test.ts"]);

    // Act
    const problems = await checkAnchorPaths(files, ANSWER);

    // Assert
    deepStrictEqual(problems, CREATE_ANCHORS_PRESENT_PROBLEMS);
  });

  it("refuses as not checked an existing anchor a listing cut at its cap leaves out", async () => {
    // Arrange
    const files = repository();
    files.listings.set(`${WORKSPACE}/docs/fr`, [...Array.from({ length: LIST_CAP }, (_, i) => `a${i}.md`), "commands.md"]);

    // Act
    const problems = await checkAnchorPaths(files, ANSWER);

    // Assert
    deepStrictEqual(problems, [`B2 S1: anchor "docs/fr/commands.md" not checked: its folder lists more than ${LIST_CAP} entries`]);
  });

  it("lists each folder once, and a listing that throws reads as empty", async () => {
    // Arrange
    const files = new FakeFiles();
    files.listings.set(`${WORKSPACE}/docs`, ["commands.md"]);
    files.listings.set(`${WORKSPACE}/src/shared/domain`, []);
    const failing = throwingOn(files, `${WORKSPACE}/docs/fr`);

    // Act
    const problems = await checkAnchorPaths(failing, ANSWER);

    // Assert
    deepStrictEqual(problems, ["B2 S1: docs/fr/commands.md does not exist"]);
    deepStrictEqual(files.listed, [`${WORKSPACE}/src/shared/domain`, `${WORKSPACE}/docs`]);
  });

  it("refuses a path that holds a colon without listing its folder", async () => {
    // Arrange
    const files = new FakeFiles();
    const colon = answerWithExisting(["docs/commands.md:12"]);

    // Act
    const problems = await checkAnchorPaths(files, colon);

    // Assert
    deepStrictEqual(problems, ['B1 S1: anchor path "docs/commands.md:12" holds ":"']);
    deepStrictEqual(files.listed, []);
  });

  it("lists a folder once across the calls that share one listings map", async () => {
    // Arrange
    const files = repository();
    files.listings.set(`${WORKSPACE}/src/shared/domain`, []);
    const listings: AnchorListings = new Map();
    const first = await checkAnchorPaths(files, ANSWER, listings);

    // Act
    const second = await checkAnchorPaths(files, ANSWER, listings);

    // Assert
    deepStrictEqual(first, []);
    deepStrictEqual(second, []);
    deepStrictEqual(files.listed, [`${WORKSPACE}/src/shared/domain`, `${WORKSPACE}/docs`, `${WORKSPACE}/docs/fr`]);
  });

  it("checks 40 folders at most, and refuses every existing anchor past them as not checked", async () => {
    // Arrange
    const files = new FakeFiles();
    const many = answerWithExisting(FORTY_FIVE_FOLDERS);

    // Act
    const problems = await checkAnchorPaths(files, many);

    // Assert
    ok(files.listed.length === MAX_ANCHOR_FOLDERS, `${files.listed.length}`);
    strictEqual(problems.length, 45);
    strictEqual(problems.filter((p) => p.endsWith("does not exist")).length, MAX_ANCHOR_FOLDERS);
    deepStrictEqual(problems.slice(MAX_ANCHOR_FOLDERS), [40, 41, 42, 43, 44].map((i) => `B1 S1: anchor "d${i}/f.md" not checked: more than 40 folders`));
  });
});
