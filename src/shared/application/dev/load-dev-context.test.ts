// The dev context (pack, work folder, checkout warnings) and the reading of one work
// code, over FakeFiles, FakeShell and a config store on FakeFiles. The code cases
// load the fixture work folder tests/fixtures/dev/workbench/demo/. Run:
//   node --test src/shared/application/dev/load-dev-context.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { HARNESS_TODO, ORKEON_IGNORE_PROBE, listDevCodes, loadDevCode, loadDevContext, probeDevCodes } from "./load-dev-context.ts";
import { ORKEON_PACK_PATH } from "./find-repo-pack.ts";
import {
  BOTH, CONFIG, DEMO_SHEETS, demoContext, LISTED_CODES, manyCodes, namedNotes, NOT_IGNORED, PROBE_ONLY, readSpy, setup,
  TODO_WARNING, todoHolding, todoWithSettings,
} from "./load-dev-context.fixtures.ts";
import { WORKSPACE } from "../../domain/vfs.ts";

describe("loadDevContext — the work folder", () => {
  it("lets dev.workDir beat the pack's layout.work", async () => {
    // Arrange
    const { files, shell, config } = setup();
    files.files.set(ORKEON_PACK_PATH, "layout:\n  work: backstage/tasks\n");
    files.files.set(CONFIG, JSON.stringify({ "dev.workDir": "notes" }));
    files.listings.set(WORKSPACE, ["notes", "backstage"]);

    // Act
    const ctx = await loadDevContext({ files, shell, config });

    // Assert
    strictEqual(ctx.work.folder, "notes");
    strictEqual(ctx.work.outcome, "applied");
    deepStrictEqual(ctx.work.request, { value: "notes", source: "dev.workDir" });
    strictEqual(ctx.pack?.shown, ".orkeon/repo.yaml");
  });

  it("warns when the config cannot be read, and lets the pack decide", async () => {
    // Arrange
    const { files, shell } = setup();
    files.files.set(ORKEON_PACK_PATH, "layout:\n  work: backstage/tasks\n");
    files.listings.set(WORKSPACE, ["backstage"]);
    files.listings.set(`${WORKSPACE}/backstage`, ["tasks"]);
    const failing = { readValue: async () => { throw new Error("no files tool"); } };

    // Act
    const ctx = await loadDevContext({ files, shell, config: failing });

    // Assert
    strictEqual(ctx.work.folder, "backstage/tasks");
    strictEqual(ctx.warnings[0], "dev.workDir could not be read (no files tool): the pack or the default decides");
  });
});

describe("loadDevContext — the ignore check", () => {
  it("warns for both probes when git ignores neither", async () => {
    // Arrange
    const { files, shell, config } = setup();
    shell.results[BOTH] = { exitCode: 1, stdout: "" };

    // Act
    const ctx = await loadDevContext({ files, shell, config });

    // Assert
    deepStrictEqual(ctx.warnings, [NOT_IGNORED(ORKEON_IGNORE_PROBE), NOT_IGNORED("workbench/")]);
    ok(shell.commands.includes(BOTH), shell.commands.join("\n"));
  });

  it("warns only for the probe git does not print", async () => {
    // Arrange
    const { files, shell, config } = setup();
    shell.results[BOTH] = { exitCode: 0, stdout: "workbench/\n" };

    // Act
    const ctx = await loadDevContext({ files, shell, config });

    // Assert
    deepStrictEqual(ctx.warnings, [NOT_IGNORED(ORKEON_IGNORE_PROBE)]);
  });

  it("says nothing when git fails", async () => {
    // Arrange
    const { files, shell, config } = setup();
    shell.results[BOTH] = { exitCode: 128, stdout: "", stderr: "fatal: not a git repository" };

    // Act
    const ctx = await loadDevContext({ files, shell, config });

    // Assert
    deepStrictEqual(ctx.warnings, []);
  });

  it("says nothing when the runtime refuses git", async () => {
    // Arrange
    const refused = setup();
    refused.shell.errors[BOTH] = new Error("command refused");

    // Act
    const ctx = await loadDevContext(refused);

    // Assert
    deepStrictEqual(ctx.warnings, []);
  });

  it("does not probe workbench/ when a named folder applies", async () => {
    // Arrange
    const { files, shell, config } = namedNotes();

    // Act
    const ctx = await loadDevContext({ files, shell, config });

    // Assert
    deepStrictEqual(shell.commands, [PROBE_ONLY]);
    deepStrictEqual(ctx.warnings, []);
  });
});

describe("loadDevContext — the todo/ transition warning", () => {
  it("warns when todo/ holds a harness folder and nothing names workbench/", async () => {
    // Arrange
    const deps = todoHolding(["pr-x"]);

    // Act
    const ctx = await loadDevContext(deps);

    // Assert
    deepStrictEqual(ctx.warnings, [TODO_WARNING]);
  });

  it("warns when a sub-folder of todo/ holds a dev artefact", async () => {
    // Arrange
    const deps = todoHolding(["notes", "feature"]);
    deps.files.listings.set(`${HARNESS_TODO}/feature`, ["FEATURE-PLAN.md"]);

    // Act
    const ctx = await loadDevContext(deps);

    // Assert
    deepStrictEqual(ctx.warnings, [TODO_WARNING]);
  });

  it("is silenced by HARNESS_WORK_DIR=workbench in the harness settings", async () => {
    // Arrange
    const deps = todoWithSettings(JSON.stringify({ env: { HARNESS_WORK_DIR: "workbench" } }));

    // Act
    const ctx = await loadDevContext(deps);

    // Assert
    deepStrictEqual(ctx.warnings, []);
  });

  it("is silenced by a request naming a folder", async () => {
    // Arrange
    const requested = namedNotes();
    requested.files.listings.set(HARNESS_TODO, ["pr-x"]);

    // Act
    const ctx = await loadDevContext(requested);

    // Assert
    deepStrictEqual(ctx.warnings, []);
  });

  it("counts a malformed settings file as unset", async () => {
    // Arrange
    const deps = todoWithSettings("{ not json", ["release-1.0"]);

    // Act
    const ctx = await loadDevContext(deps);

    // Assert
    deepStrictEqual(ctx.warnings, [TODO_WARNING]);
  });
});

describe("loadDevCode and listDevCodes over the fixture folder", () => {
  it("reads the spec, the plan, every sheet, verdict and the batches log", async () => {
    // Arrange
    const { files, work } = await demoContext();

    // Act
    const lookup = await loadDevCode({ files }, work, "demo");

    // Assert
    ok(lookup.found !== null);
    const code = lookup.found;
    strictEqual(code.shown, "workbench/demo");
    strictEqual(code.spec, "SPEC-demo.md");
    strictEqual(code.change, null);
    strictEqual(code.plan?.name, "DEMO-PLAN.md");
    strictEqual(code.plan?.plan.feature, "Demo feature");
    deepStrictEqual(code.plan?.plan.batches.map((b) => b.id), ["F1", "F2", "F3"]);
    deepStrictEqual(code.sheets.map((s) => [s.batch, s.name]), DEMO_SHEETS);
    deepStrictEqual(code.verdicts.map((v) => v.batch), ["F1", "F2"]);
    deepStrictEqual(code.state?.state.open, []);
    deepStrictEqual(code.state?.state.entries.at(-1)?.event, "returned");
    deepStrictEqual(code.warnings, []);
  });

  it("names the codes there are when the code is absent", async () => {
    // Arrange
    const { files, work } = await demoContext();

    // Act
    const lookup = await loadDevCode({ files }, work, "other");

    // Assert
    deepStrictEqual(lookup, { found: null, reason: "absent", codes: ["demo"] });
  });

  it("refuses a folder with no spec, change or plan", async () => {
    // Arrange
    const { files, work } = await demoContext();
    files.listings.set(`${WORKSPACE}/workbench`, ["demo", "bare"]);
    files.listings.set(`${WORKSPACE}/workbench/bare`, ["notes.md"]);

    // Act
    const lookup = await loadDevCode({ files }, work, "bare");

    // Assert
    deepStrictEqual(lookup, { found: null, reason: "empty", codes: [] });
  });

  it("refuses an unreachable work folder", async () => {
    // Arrange
    const { files, work } = await demoContext();

    // Act
    const lookup = await loadDevCode({ files }, { ...work, vfsPath: null }, "demo");

    // Assert
    deepStrictEqual(lookup, { found: null, reason: "unreachable", codes: [] });
  });

  it("reads the plan named like the code when there are two, and says so", async () => {
    // Arrange
    const { files, work } = await demoContext({ "AAA-PLAN.md": "# AAA-PLAN — Older plan\n" });

    // Act
    const lookup = await loadDevCode({ files }, work, "demo");

    // Assert
    ok(lookup.found !== null);
    strictEqual(lookup.found.plan?.name, "DEMO-PLAN.md");
    deepStrictEqual(lookup.found.warnings,
      ["several plans in workbench/demo/: AAA-PLAN.md, DEMO-PLAN.md: DEMO-PLAN.md is read"]);
  });

  it("skips a file it cannot read and reports format problems with their line", async () => {
    // Arrange
    const { files, work } = await demoContext({ "DEMO-PLAN-F4.md": "# DEMO-PLAN-F4 — More\n\nTDD: RED [x] GREEN\n" });
    files.readErrors.set(`${WORKSPACE}/workbench/demo/DEMO-VERIFY-F1.md`, new Error("permission denied"));

    // Act
    const lookup = await loadDevCode({ files }, work, "demo");

    // Assert
    ok(lookup.found !== null);
    deepStrictEqual(lookup.found.verdicts.map((v) => v.batch), ["F2"]);
    deepStrictEqual(lookup.found.warnings, [
      "workbench/demo/DEMO-PLAN-F4.md:3: malformed TDD line 'TDD: RED [x] GREEN'",
      "workbench/demo/DEMO-VERIFY-F1.md cannot be read (permission denied)",
    ]);
  });

  it("lists the codes holding a spec, change or plan, sorted, reading no file", async () => {
    // Arrange
    const { files, work } = await demoContext();
    files.listings.set(`${WORKSPACE}/workbench`, ["fix-x", "demo", "bare", ".hidden"]);
    files.listings.set(`${WORKSPACE}/workbench/fix-x`, ["CHANGE-fix-x.md"]);
    files.listings.set(`${WORKSPACE}/workbench/bare`, ["notes.md"]);
    const reads: string[] = [];
    const spy = readSpy(files, reads);

    // Act
    const codes = await listDevCodes({ files: spy }, work);

    // Assert
    deepStrictEqual(codes, LISTED_CODES);
    deepStrictEqual(reads, []);
  });

  it("skips loose files, sorts before the probe cap of 50 and counts what the cap left out", async () => {
    // Arrange
    const { files, work } = await demoContext();
    const folders = manyCodes(files);

    // Act
    const probe = await probeDevCodes({ files }, work);

    // Assert
    strictEqual(probe.notProbed, 5);
    deepStrictEqual(probe.codes.map((c) => c.code), [...folders].reverse().slice(0, 50));
  });

  it("lists the codes the probe finds", async () => {
    // Arrange
    const { files, work } = await demoContext();
    manyCodes(files);
    const probe = await probeDevCodes({ files }, work);

    // Act
    const codes = await listDevCodes({ files }, work);

    // Assert
    deepStrictEqual(codes, probe.codes);
  });
});
