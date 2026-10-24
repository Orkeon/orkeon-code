// Unit tests for resolving and reading the source of a plan, over FakeFiles. Run:
//   node --test src/shared/application/dev/plan-source.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { FakeFiles } from "../../../../tests/support/fake-files.ts";
import type { WorkFolder } from "./resolve-work-folder.ts";
import { MAX_SOURCE_CHARS, readPlanSource, resolvePlanSource } from "./plan-source.ts";
import type { ResolvedSource } from "./plan-source.ts";

const WORK: WorkFolder = {
  folder: "workbench", vfsPath: "/workspace/workbench", outcome: "applied", request: null, exists: true, note: null,
};
const SPEC_TEXT = "# trim — Trim stale entries\n### UC-01 — Trim the store\n";

function setup(codes: Record<string, string[]> = {}): FakeFiles {
  const files = new FakeFiles();
  files.listings.set("/workspace/workbench", [...Object.keys(codes).map((c) => `${c}/`), "README.md"]);
  for (const [code, names] of Object.entries(codes)) files.listings.set(`/workspace/workbench/${code}`, names);
  return files;
}
const source = (kind: "spec" | "change", code: string, folderShown: string, file: string): ResolvedSource => ({
  kind, code, prefix: code.toUpperCase(), folderShown, sourceShown: `${folderShown}/${file}`,
});
const refusal = async (files: FakeFiles, token: string | null, work: WorkFolder = WORK): Promise<string> => {
  const r = await resolvePlanSource(files, work, token);
  return r.ok ? "resolved" : r.text;
};

describe("resolvePlanSource with no token", () => {
  it("takes the one code with a spec or a brief and no plan", async () => {
    const files = setup({ done: ["SPEC-done.md", "DONE-PLAN.md"], trim: ["SPEC-trim.md"], notes: ["x.txt"] });
    deepStrictEqual(await resolvePlanSource(files, WORK, null), { ok: true, source: source("spec", "trim", "workbench/trim", "SPEC-trim.md") });
  });
  it("refuses when no code could be planned", async () => {
    strictEqual(await refusal(setup({ done: ["CHANGE-done.md", "DONE-PLAN.md"] }), null),
      "dev-plan: no SPEC- or CHANGE- file without a plan in workbench/: name one, e.g. /dev-plan <code>");
  });
  it("refuses when several codes could be planned, naming them", async () => {
    strictEqual(await refusal(setup({ alpha: ["SPEC-alpha.md"], beta: ["CHANGE-beta.md"] }), null),
      "dev-plan: several codes could be planned (alpha, beta): name one, e.g. /dev-plan alpha");
  });
});

describe("resolvePlanSource with a code", () => {
  it("finds the brief of the code folder", async () => {
    deepStrictEqual(await resolvePlanSource(setup({ slow: ["CHANGE-slow.md", "notes.md"] }), WORK, "slow"),
      { ok: true, source: source("change", "slow", "workbench/slow", "CHANGE-slow.md") });
  });
  it("refuses a folder with neither file, or with both", async () => {
    strictEqual(await refusal(setup({ trim: ["SPEC-other.md"] }), "trim"),
      "dev-plan: workbench/trim/ holds no SPEC-trim.md nor CHANGE-trim.md");
    strictEqual(await refusal(setup(), "absent"), "dev-plan: workbench/absent/ holds no SPEC-absent.md nor CHANGE-absent.md");
    strictEqual(await refusal(setup({ trim: ["SPEC-trim.md", "CHANGE-trim.md"] }), "trim"),
      "dev-plan: workbench/trim/ holds both SPEC-trim.md and CHANGE-trim.md: name the file");
  });
});

describe("resolvePlanSource with a path", () => {
  it("takes a relative path, or one under /workspace/, its parent as the folder", async () => {
    const files = setup();
    deepStrictEqual(await resolvePlanSource(files, WORK, "docs/specs/SPEC-trim.md"),
      { ok: true, source: source("spec", "trim", "docs/specs", "SPEC-trim.md") });
    deepStrictEqual(await resolvePlanSource(files, WORK, "/workspace/workbench/slow/CHANGE-slow.md"),
      { ok: true, source: source("change", "slow", "workbench/slow", "CHANGE-slow.md") });
  });
  it("refuses what is neither a code nor a source path", async () => {
    const files = setup();
    for (const token of ["workbench/trim/TRIM-PLAN.md", "../SPEC-trim.md", "/etc/SPEC-trim.md", "a b"]) {
      strictEqual(await refusal(files, token), `dev-plan: '${token}' is neither a code nor a SPEC-<code>.md / CHANGE-<code>.md path`);
    }
  });
  it("refuses a source under .claude/", async () => {
    for (const token of [".claude/local/SPEC-trim.md", "/workspace/.claude/SPEC-trim.md"]) {
      strictEqual(await refusal(setup(), token), "dev-plan: a source under .claude/ is the harness's own: copy it to the work folder first");
    }
  });
});

describe("resolvePlanSource outside the mounts", () => {
  it("refuses a work folder with no virtual path", async () => {
    const work: WorkFolder = { ...WORK, folder: "/home/dev/repo/workbench", vfsPath: null, outcome: "main-worktree" };
    strictEqual(await refusal(setup(), "trim", work),
      "dev-plan: the work folder /home/dev/repo/workbench is outside /workspace: run /dev-plan from the main worktree");
  });
});

describe("readPlanSource", () => {
  const trim = source("spec", "trim", "workbench/trim", "SPEC-trim.md");
  it("reads and parses the source, at most MAX_SOURCE_CHARS characters", async () => {
    const files = setup();
    files.files.set("/workspace/workbench/trim/SPEC-trim.md", SPEC_TEXT + "x".repeat(MAX_SOURCE_CHARS));
    const r = await readPlanSource(files, trim);
    strictEqual(r.ok && r.text.length, MAX_SOURCE_CHARS);
    deepStrictEqual(r.ok && r.parsed.ids.map((i) => i.id), ["UC-01"]);
    strictEqual(r.ok && r.parsed.code, "trim");
  });
  it("gives the refusal text with the first line of the error", async () => {
    const files = setup();
    files.readErrors.set("/workspace/workbench/trim/SPEC-trim.md", new Error("permission denied\nsecond line"));
    deepStrictEqual(await readPlanSource(files, trim),
      { ok: false, text: "dev-plan: workbench/trim/SPEC-trim.md cannot be read (permission denied)" });
  });
});
