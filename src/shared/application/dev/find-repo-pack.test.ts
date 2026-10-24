// Unit tests for the repository pack lookup. Run:
//   node --test src/shared/application/dev/find-repo-pack.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { FakeFiles } from "../../../../tests/support/fake-files.ts";
import { HARNESS_PACKS_DIR, ORKEON_PACK_PATH, findRepoPack } from "./find-repo-pack.ts";

const harnessPack = (name: string): string => `${HARNESS_PACKS_DIR}/${name}/references/repo.yaml`;

/** FakeFiles that records every path read. */
class SpyFiles extends FakeFiles {
  reads: string[] = [];
  override async read(path: string, maxLength?: number): Promise<string> {
    this.reads.push(path);
    return super.read(path, maxLength);
  }
}

describe("findRepoPack", () => {
  it("prefers .orkeon/repo.yaml over a harness pack", async () => {
    const files = new SpyFiles();
    files.files.set(ORKEON_PACK_PATH, "layout:\n  work: own/tasks\n");
    files.listings.set(HARNESS_PACKS_DIR, ["repo-x"]);
    files.files.set(harnessPack("repo-x"), "layout:\n  work: harness/tasks\n");
    const r = await findRepoPack(files);
    strictEqual(r.found?.origin, "orkeon");
    strictEqual(r.found?.path, ORKEON_PACK_PATH);
    strictEqual(r.found?.shown, ".orkeon/repo.yaml");
    strictEqual(r.found?.pack.layout.work, "own/tasks");
    deepStrictEqual(r.warnings, []);
    deepStrictEqual(files.reads, [ORKEON_PACK_PATH]);
  });

  it("falls back to the repo-* pack of the harness", async () => {
    const files = new FakeFiles();
    files.listings.set(HARNESS_PACKS_DIR, ["quality", "repo-orkeon"]);
    files.files.set(harnessPack("repo-orkeon"), "layout:\n  work: backstage/tasks\n");
    const r = await findRepoPack(files);
    strictEqual(r.found?.origin, "harness");
    strictEqual(r.found?.shown, ".claude/harness/packs/repo-orkeon/references/repo.yaml");
    strictEqual(r.found?.pack.layout.work, "backstage/tasks");
    deepStrictEqual(r.warnings, []);
  });

  it("finds no pack when neither exists", async () => {
    deepStrictEqual(await findRepoPack(new FakeFiles()), { found: null, warnings: [] });
  });

  it("treats a listing that throws as no harness pack", async () => {
    const files = new FakeFiles();
    files.list = async () => { throw new Error("outside the mounts"); };
    deepStrictEqual(await findRepoPack(files), { found: null, warnings: [] });
  });

  it("reads the first of several repo-* packs in sorted order, and warns", async () => {
    const files = new FakeFiles();
    files.listings.set(HARNESS_PACKS_DIR, ["repo-b", "dev", "repo-a"]);
    files.files.set(harnessPack("repo-a"), "contrib:\n  branch: a\n");
    files.files.set(harnessPack("repo-b"), "contrib:\n  branch: b\n");
    const r = await findRepoPack(files);
    strictEqual(r.found?.pack.contrib.branch, "a");
    deepStrictEqual(r.warnings, [
      "several repository packs are deployed (repo-a, repo-b): .claude/harness/packs/repo-a/references/repo.yaml is read",
    ]);
  });

  it("ignores a .orkeon pack that does not parse, and reads no harness pack", async () => {
    const files = new SpyFiles();
    files.files.set(ORKEON_PACK_PATH, "layout:\n  work: a\n  work: b\n");
    files.listings.set(HARNESS_PACKS_DIR, ["repo-x"]);
    files.files.set(harnessPack("repo-x"), "layout:\n  work: harness/tasks\n");
    const r = await findRepoPack(files);
    strictEqual(r.found, null);
    deepStrictEqual(r.warnings, [".orkeon/repo.yaml:3: a duplicate key 'work': the repository pack is ignored"]);
    deepStrictEqual(files.reads, [ORKEON_PACK_PATH]);
  });

  it("warns on a pack that cannot be read, with the first line of the error", async () => {
    const files = new SpyFiles();
    files.readErrors.set(ORKEON_PACK_PATH, new Error("permission denied\nmore detail"));
    files.listings.set(HARNESS_PACKS_DIR, ["repo-x"]);
    files.files.set(harnessPack("repo-x"), "layout:\n  work: harness/tasks\n");
    const r = await findRepoPack(files);
    strictEqual(r.found, null);
    deepStrictEqual(r.warnings, [".orkeon/repo.yaml cannot be read (permission denied): no repository pack is used"]);
    deepStrictEqual(files.reads, [ORKEON_PACK_PATH]);
  });

  it("turns each issue of the pack into a warning", async () => {
    const files = new FakeFiles();
    files.files.set(ORKEON_PACK_PATH, "commands:\n  test: [a]\n");
    const r = await findRepoPack(files);
    deepStrictEqual(r.found?.issues, [{ key: "commands.test", message: "expected a string, found a list" }]);
    deepStrictEqual(r.warnings, [".orkeon/repo.yaml: commands.test: expected a string, found a list"]);
  });
});
