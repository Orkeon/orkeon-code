// The dev context (pack, work folder, checkout warnings) and the reading of one work
// code, over FakeFiles, FakeShell and a config store on FakeFiles. The code cases
// load the fixture work folder tests/fixtures/dev/workbench/demo/. Run:
//   node --test src/shared/application/dev/load-dev-context.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  HARNESS_SETTINGS_LOCAL, HARNESS_TODO, ORKEON_IGNORE_PROBE, checkIgnoreCommand, listDevCodes, loadDevCode,
  loadDevContext, probeDevCodes,
} from "./load-dev-context.ts";
import { ORKEON_PACK_PATH } from "./find-repo-pack.ts";
import { createConfigStore } from "../config-store.ts";
import { FakeFiles } from "../../../../tests/support/fake-files.ts";
import { FakeShell } from "../../../../tests/support/fake-shell.ts";
import { FakeSessionStore } from "../../../../tests/support/fake-session-store.ts";

const DEMO_DIR = fileURLToPath(new URL("../../../../tests/fixtures/dev/workbench/demo/", import.meta.url));
const CONFIG = "/workspace/.orkeon/config.json";
const BOTH = checkIgnoreCommand([ORKEON_IGNORE_PROBE, "workbench/"]);
const PROBE_ONLY = checkIgnoreCommand([ORKEON_IGNORE_PROBE]);
const NOT_IGNORED = (p: string) => `${p} is not ignored by git: add it to .gitignore (Orkeon Code never edits it)`;
const TODO_WARNING =
  "todo/ holds harness artefacts and nothing names workbench/: set layout.work: workbench in the pack, " +
  "or HARNESS_WORK_DIR=workbench in .claude/settings.local.json env (W-01)";

function setup() {
  const files = new FakeFiles();
  const shell = new FakeShell();
  const config = createConfigStore({ files, session: new FakeSessionStore() });
  return { files, shell, config };
}

/** The demo fixture folder at /workspace/workbench/demo, plus any extra file names. */
function loadDemo(files: FakeFiles, extra: Record<string, string> = {}): void {
  const names = readdirSync(DEMO_DIR).sort();
  for (const name of names) files.files.set(`/workspace/workbench/demo/${name}`, readFileSync(DEMO_DIR + name, "utf-8"));
  for (const [name, text] of Object.entries(extra)) files.files.set(`/workspace/workbench/demo/${name}`, text);
  files.listings.set("/workspace", ["workbench"]);
  files.listings.set("/workspace/workbench", ["demo"]);
  files.listings.set("/workspace/workbench/demo", [...names, ...Object.keys(extra)]);
}

describe("loadDevContext — the work folder", () => {
  it("lets dev.workDir beat the pack's layout.work", async () => {
    const { files, shell, config } = setup();
    files.files.set(ORKEON_PACK_PATH, "layout:\n  work: backstage/tasks\n");
    files.files.set(CONFIG, JSON.stringify({ "dev.workDir": "notes" }));
    files.listings.set("/workspace", ["notes", "backstage"]);
    const ctx = await loadDevContext({ files, shell, config });
    strictEqual(ctx.work.folder, "notes");
    strictEqual(ctx.work.outcome, "applied");
    deepStrictEqual(ctx.work.request, { value: "notes", source: "dev.workDir" });
    strictEqual(ctx.pack?.shown, ".orkeon/repo.yaml");
  });

  it("warns when the config cannot be read, and lets the pack decide", async () => {
    const { files, shell, config } = setup();
    files.files.set(ORKEON_PACK_PATH, "layout:\n  work: backstage/tasks\n");
    files.listings.set("/workspace", ["backstage"]);
    files.listings.set("/workspace/backstage", ["tasks"]);
    const failing = { readValue: async () => { throw new Error("no files tool"); } };
    const ctx = await loadDevContext({ files, shell, config: failing });
    strictEqual(ctx.work.folder, "backstage/tasks");
    strictEqual(ctx.warnings[0], "dev.workDir could not be read (no files tool): the pack or the default decides");
  });
});

describe("loadDevContext — the ignore check", () => {
  it("warns for both probes when git ignores neither", async () => {
    const { files, shell, config } = setup();
    shell.results[BOTH] = { exitCode: 1, stdout: "" };
    const ctx = await loadDevContext({ files, shell, config });
    deepStrictEqual(ctx.warnings, [NOT_IGNORED(ORKEON_IGNORE_PROBE), NOT_IGNORED("workbench/")]);
    ok(shell.commands.includes(BOTH));
  });

  it("warns only for the probe git does not print", async () => {
    const { files, shell, config } = setup();
    shell.results[BOTH] = { exitCode: 0, stdout: "workbench/\n" };
    deepStrictEqual((await loadDevContext({ files, shell, config })).warnings, [NOT_IGNORED(ORKEON_IGNORE_PROBE)]);
  });

  it("says nothing when git fails or refuses", async () => {
    const { files, shell, config } = setup();
    shell.results[BOTH] = { exitCode: 128, stdout: "", stderr: "fatal: not a git repository" };
    deepStrictEqual((await loadDevContext({ files, shell, config })).warnings, []);
    const refused = setup();
    refused.shell.errors[BOTH] = new Error("command refused");
    deepStrictEqual((await loadDevContext(refused)).warnings, []);
  });

  it("does not probe workbench/ when a named folder applies", async () => {
    const { files, shell, config } = setup();
    files.files.set(CONFIG, JSON.stringify({ "dev.workDir": "notes" }));
    files.listings.set("/workspace", ["notes"]);
    shell.results[PROBE_ONLY] = { exitCode: 0, stdout: ".orkeon/config.json\n" };
    const ctx = await loadDevContext({ files, shell, config });
    deepStrictEqual(shell.commands, [PROBE_ONLY]);
    deepStrictEqual(ctx.warnings, []);
  });
});

describe("loadDevContext — the todo/ transition warning", () => {
  const ignored = { exitCode: 0, stdout: ".orkeon/config.json\nworkbench/\n" };

  it("warns when todo/ holds a harness folder and nothing names workbench/", async () => {
    const { files, shell, config } = setup();
    shell.results[BOTH] = ignored;
    files.listings.set(HARNESS_TODO, ["pr-x"]);
    deepStrictEqual((await loadDevContext({ files, shell, config })).warnings, [TODO_WARNING]);
  });

  it("warns when a sub-folder of todo/ holds a dev artefact", async () => {
    const { files, shell, config } = setup();
    shell.results[BOTH] = ignored;
    files.listings.set(HARNESS_TODO, ["notes", "feature"]);
    files.listings.set(`${HARNESS_TODO}/feature`, ["FEATURE-PLAN.md"]);
    deepStrictEqual((await loadDevContext({ files, shell, config })).warnings, [TODO_WARNING]);
  });

  it("is silenced by HARNESS_WORK_DIR=workbench in the harness settings, or by a request", async () => {
    const { files, shell, config } = setup();
    shell.results[BOTH] = ignored;
    files.listings.set(HARNESS_TODO, ["pr-x"]);
    files.files.set(HARNESS_SETTINGS_LOCAL, JSON.stringify({ env: { HARNESS_WORK_DIR: "workbench" } }));
    deepStrictEqual((await loadDevContext({ files, shell, config })).warnings, []);

    const requested = setup();
    requested.shell.results[PROBE_ONLY] = { exitCode: 0, stdout: ".orkeon/config.json\n" };
    requested.files.listings.set(HARNESS_TODO, ["pr-x"]);
    requested.files.listings.set("/workspace", ["notes"]);
    requested.files.files.set(CONFIG, JSON.stringify({ "dev.workDir": "notes" }));
    deepStrictEqual((await loadDevContext(requested)).warnings, []);
  });

  it("counts a malformed settings file as unset", async () => {
    const { files, shell, config } = setup();
    shell.results[BOTH] = ignored;
    files.listings.set(HARNESS_TODO, ["release-1.0"]);
    files.files.set(HARNESS_SETTINGS_LOCAL, "{ not json");
    deepStrictEqual((await loadDevContext({ files, shell, config })).warnings, [TODO_WARNING]);
  });
});

describe("loadDevCode and listDevCodes over the fixture folder", () => {
  async function demoContext(extra: Record<string, string> = {}) {
    const { files, shell, config } = setup();
    loadDemo(files, extra);
    const ctx = await loadDevContext({ files, shell, config });
    return { files, work: ctx.work };
  }

  it("reads the spec, the plan, every sheet, verdict and the batches log", async () => {
    const { files, work } = await demoContext();
    const lookup = await loadDevCode({ files }, work, "demo");
    ok(lookup.found !== null);
    const code = lookup.found;
    strictEqual(code.shown, "workbench/demo");
    strictEqual(code.spec, "SPEC-demo.md");
    strictEqual(code.change, null);
    strictEqual(code.plan?.name, "DEMO-PLAN.md");
    strictEqual(code.plan?.plan.feature, "Demo feature");
    deepStrictEqual(code.plan?.plan.batches.map((b) => b.id), ["F1", "F2", "F3"]);
    deepStrictEqual(code.sheets.map((s) => [s.batch, s.name]), [
      ["F1", "DEMO-PLAN-F1.md"], ["F2", "DEMO-PLAN-F2.md"], ["F3", "DEMO-PLAN-F3.md"],
    ]);
    deepStrictEqual(code.verdicts.map((v) => v.batch), ["F1", "F2"]);
    deepStrictEqual(code.state?.state.open, []);
    deepStrictEqual(code.state?.state.entries.at(-1)?.event, "returned");
    deepStrictEqual(code.warnings, []);
  });

  it("names the codes there are when the code is absent", async () => {
    const { files, work } = await demoContext();
    deepStrictEqual(await loadDevCode({ files }, work, "other"), { found: null, reason: "absent", codes: ["demo"] });
  });

  it("refuses a folder with no spec, change or plan, and an unreachable work folder", async () => {
    const { files, work } = await demoContext();
    files.listings.set("/workspace/workbench", ["demo", "bare"]);
    files.listings.set("/workspace/workbench/bare", ["notes.md"]);
    deepStrictEqual(await loadDevCode({ files }, work, "bare"), { found: null, reason: "empty", codes: [] });
    deepStrictEqual(await loadDevCode({ files }, { ...work, vfsPath: null }, "demo"),
      { found: null, reason: "unreachable", codes: [] });
  });

  it("reads the plan named like the code when there are two, and says so", async () => {
    const { files, work } = await demoContext({ "AAA-PLAN.md": "# AAA-PLAN — Older plan\n" });
    const lookup = await loadDevCode({ files }, work, "demo");
    ok(lookup.found !== null);
    strictEqual(lookup.found.plan?.name, "DEMO-PLAN.md");
    deepStrictEqual(lookup.found.warnings,
      ["several plans in workbench/demo/: AAA-PLAN.md, DEMO-PLAN.md: DEMO-PLAN.md is read"]);
  });

  it("skips a file it cannot read and reports format problems with their line", async () => {
    const { files, work } = await demoContext({ "DEMO-PLAN-F4.md": "# DEMO-PLAN-F4 — More\n\nTDD: RED [x] GREEN\n" });
    files.readErrors.set("/workspace/workbench/demo/DEMO-VERIFY-F1.md", new Error("permission denied"));
    const lookup = await loadDevCode({ files }, work, "demo");
    ok(lookup.found !== null);
    deepStrictEqual(lookup.found.verdicts.map((v) => v.batch), ["F2"]);
    deepStrictEqual(lookup.found.warnings, [
      "workbench/demo/DEMO-PLAN-F4.md:3: malformed TDD line 'TDD: RED [x] GREEN'",
      "workbench/demo/DEMO-VERIFY-F1.md cannot be read (permission denied)",
    ]);
  });

  it("lists the codes holding a spec, change or plan, sorted, reading no file", async () => {
    const { files, work } = await demoContext();
    files.listings.set("/workspace/workbench", ["fix-x", "demo", "bare", ".hidden"]);
    files.listings.set("/workspace/workbench/fix-x", ["CHANGE-fix-x.md"]);
    files.listings.set("/workspace/workbench/bare", ["notes.md"]);
    const reads: string[] = [];
    const spy = { list: files.list.bind(files), read: async (p: string) => { reads.push(p); return files.read(p); } };
    deepStrictEqual(await listDevCodes({ files: spy }, work), [
      { code: "demo", spec: true, change: false, plan: true, sheets: 3, verdicts: 2 },
      { code: "fix-x", spec: false, change: true, plan: false, sheets: 0, verdicts: 0 },
    ]);
    deepStrictEqual(reads, []);
  });

  it("skips loose files, sorts before the probe cap of 50 and counts what the cap left out", async () => {
    const { files, work } = await demoContext();
    const loose = Array.from({ length: 60 }, (_, i) => `note-${String(i).padStart(2, "0")}.md`);
    const folders = Array.from({ length: 54 }, (_, i) => `c${String(i).padStart(2, "0")}`).reverse();
    files.listings.set("/workspace/workbench", [...loose, "README.md", ...folders, "demo/"]);
    for (const f of folders) files.listings.set(`/workspace/workbench/${f}`, [`SPEC-${f}.md`]);
    const probe = await probeDevCodes({ files }, work);
    strictEqual(probe.notProbed, 5);
    deepStrictEqual(probe.codes.map((c) => c.code), [...folders].reverse().slice(0, 50));
    deepStrictEqual(await listDevCodes({ files }, work), probe.codes);
  });
});
