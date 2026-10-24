// runDevLearn over FakeFiles loaded from tests/fixtures/dev/learn, FakeShell, FakeLlm
// and a fixed clock: --list (no model, no write), the proposals written for the one
// eligible axis, each code filter, the re-ask, the reconcile texts, the unchanged
// skip, the refusals, and no write under .claude/. Run:
//   node --test src/crews/dev-learn/application/run-dev-learn.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { FakeFiles } from "../../../../tests/support/fake-files.ts";
import { FakeLlm } from "../../../../tests/support/fake-llm.ts";
import { FakeLogger } from "../../../../tests/support/fake-logger.ts";
import { FakeSessionStore } from "../../../../tests/support/fake-session-store.ts";
import { FakeShell } from "../../../../tests/support/fake-shell.ts";
import { createConfigStore } from "../../../shared/application/config-store.ts";
import { GIT_TOPLEVEL, GIT_WORKTREE_LIST } from "../../../shared/application/dev/resolve-work-folder.ts";
import { ORKEON_IGNORE_PROBE, checkIgnoreCommand } from "../../../shared/application/dev/load-dev-context.ts";
import { motifId, parseProposalsFile } from "../../../shared/domain/dev/learn-proposals.ts";
import type { AxisProposal, ProposalsFile } from "../../../shared/domain/dev/learn-proposals.ts";
import { runDevLearn } from "./run-dev-learn.ts";
import type { DevLearnInputs } from "./run-dev-learn.ts";

const root = fileURLToPath(new URL("../../../../tests/fixtures/dev/learn/", import.meta.url));
const recorded = (name: string): string => readFileSync(join(root, name), "utf8");
const W = "/workspace/workbench";
const OUT = `${W}/learn-2026-10-22`;
const HARNESS_STATE = "/workspace/.claude/local/dev-learn-state.json";
const REFUSED = "/workspace/.orkeon/memory/refused.md";
/** The Test axis's untreated rows, by batch. */
const T = { exports: "7b3b561c93", invoices: "3a59a45e69", ledger1: "c936075d95", ledger1b: "2bfca0aab4", ledger3: "b983faad38" };
const THREE = [T.ledger1, T.ledger3, T.invoices];
const HEAD = "dev-learn — work folder workbench/ (default) — 13 untreated gaps across 7 batches in 7 verdict files " +
  "(treated: 0 by Orkeon Code, 1 by the harness; refused motifs: 2)";

function setup() {
  const files = new FakeFiles();
  const work = join(root, "workbench");
  const codes = readdirSync(work);
  files.listings.set("/workspace", ["workbench/", "CONTRIBUTING.md", "tests/", ".orkeon/"]);
  files.listings.set(W, codes.map((c) => `${c}/`));
  for (const code of codes) {
    if (!statSync(join(work, code)).isDirectory()) continue;
    const names = readdirSync(join(work, code));
    files.listings.set(`${W}/${code}`, names);
    for (const name of names) files.files.set(`${W}/${code}/${name}`, readFileSync(join(work, code, name), "utf8"));
  }
  files.files.set(HARNESS_STATE, recorded("harness-state.json"));
  files.files.set("/workspace/CONTRIBUTING.md", "# Contributing\n\nA refusal is part of a command's contract.\nKeep it short.\n");
  const shell = new FakeShell();
  shell.results[GIT_TOPLEVEL] = { stdout: "/workspace\n" };
  shell.results[checkIgnoreCommand([ORKEON_IGNORE_PROBE, "workbench/"])] = { stdout: ".orkeon/config.json\nworkbench/\n" };
  const llm = new FakeLlm();
  const config = createConfigStore({ files, session: new FakeSessionStore() });
  const deps = { files, shell, llm, config, log: new FakeLogger(), clock: () => new Date(2026, 9, 22, 14, 5) };
  return { files, shell, llm, deps };
}
const run = (deps: ReturnType<typeof setup>["deps"], input: DevLearnInputs) => runDevLearn(input, deps);

const motif = (over: Record<string, unknown> = {}) => ({
  title: "Refusal paths go untested", topic: "refusal-tests", rows: THREE,
  preventive_line: "Each refusal text of a command has a test that triggers it.",
  owner_kind: "repository", owner_path: "CONTRIBUTING.md", check: "test", status: "new",
  lines_added: ["Every refusal a command prints has a test that makes it print."],
  novelty: "the guide names no refusal test", key_term: "refusal", ...over,
});
const written = (files: FakeFiles): ProposalsFile => {
  const parsed = parseProposalsFile(files.files.get(`${OUT}/proposals.json`) ?? "");
  ok(parsed.ok, "proposals.json parses");
  return parsed.file;
};
const testAxis = (files: FakeFiles): AxisProposal => written(files).axes[0];
const noClaudeWrite = (files: FakeFiles) =>
  ok(files.writes.every((w) => !w.path.startsWith("/workspace/.claude/")), files.writes.map((w) => w.path).join(", "));

describe("runDevLearn — --list", () => {
  it("prints the backlog per axis and the refused motifs: no model call, no write", async () => {
    const f = setup();
    const text = await run(f.deps, { list: true });
    deepStrictEqual(text.split("\n"), [
      HEAD,
      "",
      "axis             gaps batches blocking",
      "Test                5       4        1",
      "Reuse               2       2        0",
      "Scope               1       1        0",
      "Conventions         1       1        0",
      "Placement           3       1        1",
      "Plan                1       1        0",
      "",
      "refused motifs:",
      "- Rounding inside handlers (harness)",
      "- keep: Each command returns a CommandView. (harness)",
    ]);
    strictEqual(f.llm.extracts.length, 0);
    deepStrictEqual(f.files.writes, []);
  });

  it("prints one axis as the harness's script does", async () => {
    const f = setup();
    for (const axis of ["Test", "tests"]) {
      const text = await run(f.deps, { axis, list: true });
      strictEqual(text, `${HEAD}\n${recorded("axis-Test.py.txt").trimEnd()}`);
    }
    strictEqual((await run(f.deps, { axis: "Placement", list: true })).split("\n").slice(1).join("\n") + "\n",
      recorded("axis-Placement.py.txt"));
    strictEqual(await run(f.deps, { axis: "Cost", list: true }), `${HEAD}\ndev-learn: nothing untreated on axis Cost`);
    deepStrictEqual(f.files.writes, []);
  });
});

describe("runDevLearn — proposals", () => {
  it("asks once for the one eligible axis and writes both files under learn-<date>/", async () => {
    const f = setup();
    f.llm.extractions = [{ motifs: [motif()], dropped: [{ title: "Vague", filter: "prevention", reason: "says nothing" }] }];
    const text = await run(f.deps, {});
    const id = motifId("Test", THREE);
    strictEqual(f.llm.extracts.length, 1);
    const prompt = f.llm.extracts[0].prompt;
    ok(prompt.includes("Axis: Test") && Object.values(T).every((r) => prompt.includes(r)), prompt);
    ok(prompt.includes("- CONTRIBUTING.md") && prompt.includes("- Rounding inside handlers"), prompt);
    deepStrictEqual(f.files.writes.map((w) => w.path), [`${OUT}/proposals.json`, `${OUT}/PROPOSALS.md`]);
    deepStrictEqual(text.split("\n"), [
      HEAD,
      `axis Test — 4 batches: 1 motifs proposed (${id}), 1 dropped`,
      "written: workbench/learn-2026-10-22/PROPOSALS.md",
      `→ /dev-learn --accept ${id}`,
      "  or /dev-learn --refuse <id> for each one you reject — read the lines first in PROPOSALS.md",
    ]);
    const axis = testAxis(f.files);
    strictEqual(axis.outcome, "proposed");
    deepStrictEqual(axis.shownRows, [T.exports, T.invoices, T.ledger1, T.ledger1b, T.ledger3]);
    deepStrictEqual(axis.motifs[0].batches, ["ledger/F1", "ledger/F3", "invoices/F2"]);
    strictEqual(axis.motifs[0].reconcile,
      "'refusal' on 1 lines of CONTRIBUTING.md, first CONTRIBUTING.md:3; the owner may already say it");
    ok(f.files.files.get(`${OUT}/PROPOSALS.md`)?.startsWith("# Learn proposals — 2026-10-22\n"));
    noClaudeWrite(f.files);
  });

  it("drops by code a motif over two batches, a refused topic and a harness-refused title", async () => {
    const f = setup();
    f.files.files.set(REFUSED, "# Refused motifs\n\nwording-of-help | ledger | 2026-10-01 | Wording of help texts\n");
    f.llm.extractions = [{
      motifs: [
        motif({ title: "Two batches only", topic: "two-batches", rows: [T.ledger1, T.ledger3] }),
        motif({ title: "Help wording", topic: "wording-of-help" }),
        motif({ title: "Rounding inside handlers", topic: "rounding" }),
      ],
      dropped: [{ title: "Model's own", filter: "novelty", reason: "the guide says it" }],
    }];
    const text = await run(f.deps, {});
    const axis = testAxis(f.files);
    strictEqual(axis.outcome, "no-motif");
    deepStrictEqual(axis.dropped, [
      { title: "Two batches only", filter: "recurrence", reason: "2 batches (ledger/F1, ledger/F3)" },
      { title: "Help wording", filter: "novelty", reason: "refused on 2026-10-01 (.orkeon/memory/refused.md)" },
      { title: "Rounding inside handlers", filter: "novelty", reason: "refused in the harness's state" },
      { title: "Model's own", filter: "novelty", reason: "the guide says it" },
    ]);
    ok(text.includes("axis Test — 4 batches: no motif kept, 4 dropped\n"), text);
    ok(text.endsWith("→ nothing to decide: the axes return once new gaps arrive"), text);
  });

  it("takes a kept line of the harness out of the lines removed", async () => {
    const f = setup();
    f.llm.extractions = [{
      motifs: [
        motif({ status: "refines", lines_removed: ["each command returns a CommandView.", "Keep it short."] }),
        motif({ title: "Only the kept line", topic: "kept-line", rows: [T.exports, T.invoices, T.ledger1],
          status: "replaces", lines_removed: ["Each command returns a CommandView."] }),
      ],
    }];
    await run(f.deps, {});
    const axis = testAxis(f.files);
    deepStrictEqual(axis.motifs.map((m) => m.linesRemoved), [["Keep it short."]]);
    deepStrictEqual(axis.dropped, [{ title: "Only the kept line", filter: "novelty", reason: "its removed line is kept (harness refusal)" }]);
  });

  it("asks again with the problems, then keeps the second answer", async () => {
    const f = setup();
    f.llm.extractions = [{ motifs: [motif({ rows: ["abc"] })] }, { motifs: [motif()] }];
    await run(f.deps, {});
    strictEqual(f.llm.extracts.length, 2);
    ok(f.llm.extracts[1].prompt.includes("answer again") &&
      f.llm.extracts[1].prompt.includes("- motif 1: row 'abc' is not one of the rows given"));
    strictEqual(testAxis(f.files).outcome, "proposed");
  });

  it("records no proposal when both tries fail, and still writes the file", async () => {
    const f = setup();
    f.llm.extractions = [new Error("bad json\nat 3"), new Error("still bad")];
    const text = await run(f.deps, {});
    strictEqual(f.llm.extracts.length, 2);
    const axis = testAxis(f.files);
    strictEqual(axis.outcome, "no-proposal");
    strictEqual(axis.reason, "the answer did not parse: still bad");
    ok(text.includes("axis Test — 4 batches: no proposal (the answer did not parse: still bad)\n"), text);
    strictEqual(f.files.writes.length, 2);
  });

  it("says an owner is absent, and names a removed line it cannot find", async () => {
    const f = setup();
    f.llm.extractions = [{
      motifs: [
        motif({ owner_path: "docs/missing.md" }),
        motif({ title: "Harness rule", topic: "harness-rule", rows: [T.exports, T.invoices, T.ledger1],
          owner_kind: "harness", owner_path: ".devcontainer/harness/packs/dev/claude/skills/dev-verify/references/audit-axes.md" }),
        motif({ title: "Refines", topic: "refines", rows: [T.exports, T.ledger1, T.ledger3], key_term: "absent-term",
          status: "refines", lines_removed: ["A line nobody wrote."] }),
      ],
    }];
    await run(f.deps, {});
    deepStrictEqual(testAxis(f.files).motifs.map((m) => m.reconcile), [
      "owner absent: docs/missing.md",
      "owner absent: .claude/skills/dev-verify/references/audit-axes.md",
      "'absent-term' not found in CONTRIBUTING.md; removed line not found: A line nobody wrote.",
    ]);
    noClaudeWrite(f.files);
  });

  it("skips an axis whose rows are those an earlier run kept no motif for", async () => {
    const f = setup();
    const earlier: ProposalsFile = {
      version: 1, date: "2026-10-20", work: "workbench",
      read: { files: 7, gaps: 13, batches: 7, treatedOrkeon: 0, treatedHarness: 1, refused: 2 },
      axes: [{ axis: "Test", batches: 4, gaps: 5, shownRows: [T.ledger3, T.ledger1b, T.ledger1, T.invoices, T.exports], hiddenRows: 0,
        outcome: "no-motif", motifs: [], dropped: [] }],
    };
    f.files.listings.set(W, [...(f.files.listings.get(W) ?? []), "learn-2026-10-20/"]);
    f.files.files.set(`${W}/learn-2026-10-20/proposals.json`, JSON.stringify(earlier));
    const text = await run(f.deps, {});
    strictEqual(f.llm.extracts.length, 0);
    ok(text.includes("axis Test — unchanged since learn-2026-10-20: no call\n"), text);
    strictEqual(testAxis(f.files).outcome, "unchanged");
  });

  it("writes nothing when no axis spans three batches", async () => {
    const f = setup();
    f.files.files.set("/workspace/.orkeon/dev-learn-state.json",
      JSON.stringify({ version: 1, treated: [T.exports, T.invoices], decisions: [] }));
    const text = await run(f.deps, {});
    ok(text.endsWith("dev-learn: no axis has untreated gaps in 3 batches or more (Reuse 2, Test 2, Scope 1, Conventions 1, Placement 1): nothing written"), text);
    strictEqual(await run(f.deps, { axis: "Reuse" }), `${HEAD.replace("13 untreated gaps across 7", "11 untreated gaps across 6").replace("0 by Orkeon Code", "2 by Orkeon Code")}\naxis Reuse — 2 batches, under the 3 a motif needs: nothing to propose`);
    strictEqual(f.llm.extracts.length, 0);
    deepStrictEqual(f.files.writes, []);
  });

  it("returns BLOCKED when a file cannot be written", async () => {
    const f = setup();
    f.llm.extractions = [{ motifs: [motif()] }];
    f.files.write = async (path: string) => { throw new Error(`disk full: ${path}`); };
    const text = await run(f.deps, {});
    ok(text.endsWith("dev-learn: BLOCKED — workbench/learn-2026-10-22/proposals.json cannot be written (disk full: /workspace/workbench/learn-2026-10-22/proposals.json)"), text);
  });
});

describe("runDevLearn — refusals", () => {
  it("refuses a bad input", async () => {
    const f = setup();
    strictEqual(await run(f.deps, { axis: "a|b" }), "dev-learn: bad input axis");
    strictEqual(await run(f.deps, { axis: "x".repeat(41) }), "dev-learn: bad input axis");
    strictEqual(f.shell.commands.length, 0);
  });

  it("refuses outside the top of the repository", async () => {
    const f = setup();
    f.shell.results[GIT_TOPLEVEL] = { stdout: "/workspace/sub\n" };
    strictEqual(await run(f.deps, {}),
      "dev-learn: the git work tree is /workspace/sub, not /workspace: run Orkeon Code at the top of the repository");
  });

  it("refuses a work folder in the main worktree", async () => {
    const f = setup();
    f.files.files.set("/workspace/.orkeon/repo.yaml", "layout:\n  work: tasks\n");
    f.shell.results[GIT_WORKTREE_LIST] = { stdout: "worktree /main\nHEAD abc\n" };
    const text = await run(f.deps, {});
    ok(text.endsWith("dev-learn: the work folder /main/tasks is in the main worktree, outside the mounts: run /dev-learn from the main checkout"), text);
    deepStrictEqual(f.files.writes, []);
  });

  it("refuses an absent work folder", async () => {
    const f = setup();
    f.files.listings.set("/workspace", ["CONTRIBUTING.md"]);
    strictEqual(await run(f.deps, {}), "dev-learn: no work folder workbench/: nothing to learn from");
  });
});
