// /dev-status, the /dev-verify arguments, the /dev-learn arguments and decisions, and the
// /dev-plan arguments and Blocking gate (commands/_lib/dev.ts) over FakeFiles, FakeShell and a config store on
// FakeFiles. The fixture work folder tests/fixtures/dev/workbench/demo/ is loaded into
// FakeFiles, so the batches and ticks the command prints are pinned to the files. Run:
//   node --test tests/commands-dev.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  DEV_LEARN_USAGE, DEV_PLAN_USAGE, DEV_STATUS_USAGE, DEV_VERIFY_USAGE, MAX_LINE_CHARS,
  devPlanGate, parseDevLearnArgs, parseDevPlanArgs, parseDevVerifyArgs, runDevLearnDecision, runDevStatus,
} from "../src/commands/_lib/dev.ts";
import type { DevLearnArgs } from "../src/commands/_lib/dev.ts";
import { parseLearnState, serializeLearnState } from "../src/shared/domain/dev/learn-state.ts";
import { serializeProposalsFile } from "../src/shared/domain/dev/learn-proposals.ts";
import type { AxisProposal, Motif, ProposalsFile } from "../src/shared/domain/dev/learn-proposals.ts";
import { ORKEON_IGNORE_PROBE, checkIgnoreCommand } from "../src/shared/application/dev/load-dev-context.ts";
import { GIT_TOPLEVEL, GIT_WORKTREE_LIST, gitDirProbe } from "../src/shared/application/dev/resolve-work-folder.ts";
import { createConfigStore } from "../src/shared/application/config-store.ts";
import { FakeFiles } from "./support/fake-files.ts";
import { FakeShell } from "./support/fake-shell.ts";
import { FakeSessionStore } from "./support/fake-session-store.ts";

const DEMO_DIR = fileURLToPath(new URL("./fixtures/dev/workbench/demo/", import.meta.url));
const BOTH = checkIgnoreCommand([ORKEON_IGNORE_PROBE, "workbench/"]);
const PROBE_WARNING =
  "warning: .orkeon/config.json is not ignored by git: add it to .gitignore (Orkeon Code never edits it)";

/** The demo fixture at /workspace/workbench/demo; git ignores workbench/ but not the probe. */
function setup() {
  const files = new FakeFiles();
  const shell = new FakeShell();
  const config = createConfigStore({ files, session: new FakeSessionStore() });
  const names = readdirSync(DEMO_DIR).sort();
  for (const name of names) files.files.set(`/workspace/workbench/demo/${name}`, readFileSync(DEMO_DIR + name, "utf-8"));
  files.listings.set("/workspace", ["workbench"]);
  files.listings.set("/workspace/workbench", ["demo"]);
  files.listings.set("/workspace/workbench/demo", names);
  shell.results[BOTH] = { exitCode: 0, stdout: "workbench/\n" };
  return { files, shell, config };
}

describe("/dev-status <code> over the fixture folder", () => {
  it("prints the batches and the ticks the files hold, one line each", async () => {
    const view = await runDevStatus(["demo"], setup());
    strictEqual(view.text, undefined);
    strictEqual(view.table, undefined);
    deepStrictEqual(view.lines, [
      "work folder: workbench/ (default)",
      "pack: none",
      'code: workbench/demo/ — spec SPEC-demo.md — plan DEMO-PLAN.md "Demo feature" (3 batches, 1 done)',
      "F1 Parsers — done 2026-10-20 — boxes 3/3 — sheet RED 2/2 GREEN 2/2 COST 2/2 — VALID 2026-10-20 14:02 fast (1 Minor)",
      "F2 Command — open — boxes 1/3 — sheet RED 1/2 GREEN 0/2 COST 0/2 — GAPS 2026-10-21 09:40 resume: 1 Major",
      "F3 Docs — open — boxes 0/2 — sheet RED 0/1 GREEN 0/1 COST 0/1 — no verdict",
      PROBE_WARNING,
    ]);
  });

  it("says a batch the log relaunched is running, with its last event", async () => {
    const deps = setup();
    const log = "/workspace/workbench/demo/DEMO-BATCHES-STATE.md";
    deps.files.files.set(log, `${deps.files.files.get(log) ?? ""}- 2026-10-21 09:45 F2 relaunched\n`);
    const lines = (await runDevStatus(["demo"], deps)).lines ?? [];
    ok(lines.some((l) => l.startsWith("F2 ") && l.endsWith(" — GAPS 2026-10-21 09:40 resume: 1 Major — running (relaunched 2026-10-21 09:45)")), lines.join("\n"));
  });

  it("warns when the plan and the other files disagree", async () => {
    const deps = setup();
    const plan = "/workspace/workbench/demo/DEMO-PLAN.md";
    const text = deps.files.files.get(plan) ?? "";
    deps.files.files.set(plan, text.replace("### Batch F3 — Docs — open", "### Batch F3 — Docs — done (2026-10-22)"));
    deps.files.files.set("/workspace/workbench/demo/DEMO-VERIFY-F2.md",
      "# DEMO-VERIFY-F2 — 2026-10-22 08:00 — fast\n\n## Verdict — VALID\n\nNone.\n");
    deps.files.files.set("/workspace/workbench/demo/DEMO-PLAN-F7.md", "# DEMO-PLAN-F7 — Stray\n");
    deps.files.listings.get("/workspace/workbench/demo")?.push("DEMO-PLAN-F7.md");
    const lines = (await runDevStatus(["demo"], deps)).lines ?? [];
    deepStrictEqual(lines.filter((l) => l.startsWith("warning: ")), [
      PROBE_WARNING,
      "warning: F2 is VALID but the plan still says open",
      "warning: F3 is done in the plan but its sheet has open ticks (RED 0/1)",
      "warning: DEMO-PLAN-F7.md has no batch line in the plan",
    ]);
    ok(lines.includes("F7 Stray — not in the plan — sheet RED 0/0 GREEN 0/0 COST 0/0 — no verdict"));
  });
});

describe("/dev-status without a code", () => {
  it("lists the codes of the work folder", async () => {
    deepStrictEqual((await runDevStatus([], setup())).lines, [
      "work folder: workbench/ (default)",
      "pack: none",
      "codes (1): demo — spec, plan, 3 sheets, 2 verdicts",
      PROBE_WARNING,
    ]);
  });

  it("says there is no code when the default folder is absent, and creates nothing", async () => {
    const deps = setup();
    deps.files.listings.set("/workspace", []);
    const view = await runDevStatus([], deps);
    deepStrictEqual(view.lines?.slice(2), [
      "no code under workbench/ (a code is a folder holding SPEC-, CHANGE- or *-PLAN.md files)",
      PROBE_WARNING,
    ]);
    deepStrictEqual(deps.files.writes, []);
  });

  it("keeps the codes line of 30 codes within the line cap and says how many it left out", async () => {
    const deps = setup();
    const codes = Array.from({ length: 30 }, (_, i) => `code-${String(i).padStart(2, "0")}`);
    deps.files.listings.set("/workspace/workbench", codes);
    for (const c of codes) deps.files.listings.set(`/workspace/workbench/${c}`, [`SPEC-${c}.md`, `${c}-PLAN.md`]);
    const lines = (await runDevStatus([], deps)).lines ?? [];
    const line = lines.find((l) => l.startsWith("codes (30): ")) ?? "";
    ok(line.length <= MAX_LINE_CHARS, `${line.length} characters`);
    const m = /^codes \(30\): (.*) · … (\d+) more$/.exec(line);
    ok(m !== null, line);
    const shown = m[1].split(" · ");
    deepStrictEqual(shown, codes.slice(0, shown.length).map((c) => `${c} — spec, plan`));
    strictEqual(shown.length + Number(m[2]), 30);
  });

  it("refuses when the work folder cannot be listed", async () => {
    const deps = setup();
    deps.files.list = async (path: string, max: number) => {
      if (path === "/workspace/workbench") throw new Error("permission denied");
      return (deps.files.listings.get(path) ?? []).slice(0, max);
    };
    strictEqual((await runDevStatus([], deps)).text, "dev-status: workbench/ cannot be listed (permission denied)");
  });
});

describe("/dev-status refusals", () => {
  it("prints the usage for two codes, with nothing run", async () => {
    const deps = setup();
    deepStrictEqual(await runDevStatus(["a", "b"], deps), { text: DEV_STATUS_USAGE });
    deepStrictEqual(deps.shell.commands, []);
  });

  it("refuses what is not a code, after the context lines", async () => {
    const view = await runDevStatus(["../x"], setup());
    strictEqual(view.text,
      "dev-status: '../x' is not a code: letters, digits, '.', '_' and '-', starting with a letter or a digit");
    deepStrictEqual(view.lines, ["work folder: workbench/ (default)", "pack: none", PROBE_WARNING]);
  });

  it("refuses an absent code naming the codes there are, and a folder with no artefact", async () => {
    strictEqual((await runDevStatus(["other"], setup())).text, "dev-status: no folder workbench/other/ (codes here: demo)");
    const deps = setup();
    deps.files.listings.set("/workspace/workbench", ["demo", "bare"]);
    deps.files.listings.set("/workspace/workbench/bare", ["notes.md"]);
    strictEqual((await runDevStatus(["bare"], deps)).text,
      "dev-status: workbench/bare/ holds no SPEC-, CHANGE- or *-PLAN.md file");
  });

  it("refuses from a linked worktree whose work folder is the main worktree's", async () => {
    const deps = setup();
    deps.files.files.set("/workspace/.orkeon/config.json", JSON.stringify({ "dev.workDir": "tasks" }));
    deps.shell.results[GIT_WORKTREE_LIST] = { stdout: "worktree /home/main\nHEAD 0000000\nbranch refs/heads/main\n" };
    deps.shell.results[GIT_TOPLEVEL] = { stdout: "/workspace\n" };
    deps.shell.results[gitDirProbe("/home/main/tasks")] = { exitCode: 0, stdout: ".git\n" };
    deps.shell.results[checkIgnoreCommand([ORKEON_IGNORE_PROBE])] = { exitCode: 0, stdout: ".orkeon/config.json\n" };
    const view = await runDevStatus(["demo"], deps);
    strictEqual(view.text,
      "dev-status: the work folder /home/main/tasks is in the main worktree, outside the mounts: " +
        "run /dev-status from the main checkout");
    deepStrictEqual(view.lines, [
      "work folder: /home/main/tasks/ (dev.workDir)",
      "pack: none",
      "warning: this checkout is a linked worktree: the work folder is the main worktree's /home/main/tasks",
    ]);
  });
});

describe("/dev-status output size", () => {
  it("shrinks a 40-batch plan of long lines with many warnings to 15 batch lines under the budget", async () => {
    const deps = setup();
    const name = "X".repeat(30);
    const state = `waiting on review by the other team ${"y".repeat(80)}`;
    const batches = Array.from({ length: 40 }, (_, i) => `### Batch F${i + 1} — ${name} — ${state}\n- [x] 1. a\n`).join("\n");
    deps.files.files.set("/workspace/workbench/demo/DEMO-PLAN.md", `# DEMO-PLAN — f\n\n${batches}`);
    const stray = Array.from({ length: 12 }, (_, i) => `DEMO-PLAN-F${100 + i}.md`);
    for (const n of stray) deps.files.files.set(`/workspace/workbench/demo/${n}`, `# ${n} — x\n`);
    deps.files.listings.get("/workspace/workbench/demo")?.push(...stray);
    const lines = (await runDevStatus(["demo"], deps)).lines ?? [];
    const batchLines = lines.filter((l) => /^F\d+ /.test(l));
    ok(batchLines.every((l) => l.length === MAX_LINE_CHARS), batchLines.join("\n"));
    strictEqual(batchLines.length, 15);
    // The full rendering holds at least the five batch lines dropped here: it would pass the budget.
    ok(lines.join("\n").length + 5 * (MAX_LINE_CHARS + 1) > 3900, `${lines.join("\n").length} characters`);
    strictEqual(lines.filter((l) => l.startsWith("warning: ")).length, 3);
    ok(lines.join("\n").length <= 3900, `${lines.join("\n").length} characters`);
    for (const line of lines) ok(line.length <= 200, line);
    ok(lines.includes("… 37 more batches (F16 to F111)"), lines.join("\n"));
    ok(lines.some((l) => /^… \d+ more warnings$/.test(l)));
  });
});

describe("parseDevVerifyArgs", () => {
  const refused = (tokens: string[]): string => {
    const r = parseDevVerifyArgs(tokens);
    return r.ok ? "(accepted)" : r.text;
  };

  it("refuses each malformed line with its own text", () => {
    strictEqual(refused([]), DEV_VERIFY_USAGE);
    strictEqual(DEV_VERIFY_USAGE,
      "usage: /dev-verify F<n> [<code> | <path>/<CODE>-PLAN.md] [fast | full | resume] [--gate-only]");
    strictEqual(refused(["demo"]), "dev-verify: 'demo' is not a batch: F<n>, e.g. F2");
    strictEqual(refused(["F2", "fast", "resume"]), "dev-verify: one mode at most (fast, full or resume), not 'fast' and 'resume'");
    strictEqual(refused(["F2", "--raw"]), "dev-verify: unknown option '--raw' (only --gate-only)");
    strictEqual(refused(["F2", "demo", "other"]), "dev-verify: one plan at most, not 'demo' and 'other'");
    strictEqual(refused(["F2", "a/b"]), "dev-verify: 'a/b' is neither a code nor a <CODE>-PLAN.md path");
    strictEqual(refused(["F2", "../x/DEMO-PLAN.md"]), "dev-verify: '../x/DEMO-PLAN.md' is neither a code nor a <CODE>-PLAN.md path");
    strictEqual(refused(["F2", "/etc/DEMO-PLAN.md"]), "dev-verify: '/etc/DEMO-PLAN.md' is neither a code nor a <CODE>-PLAN.md path");
  });

  it("takes the other tokens in any order, fast by default", () => {
    deepStrictEqual(parseDevVerifyArgs(["F2", "resume", "demo", "--gate-only"]),
      { ok: true, args: { batch: "F2", plan: "demo", mode: "resume", gateOnly: true } });
    deepStrictEqual(parseDevVerifyArgs(["F2", "--gate-only"]),
      { ok: true, args: { batch: "F2", plan: null, mode: "fast", gateOnly: true } });
    deepStrictEqual(parseDevVerifyArgs(["F12", "workbench/demo/DEMO-PLAN.md", "full"]),
      { ok: true, args: { batch: "F12", plan: "workbench/demo/DEMO-PLAN.md", mode: "full", gateOnly: false } });
  });

  it("reads fast, full and resume as modes, never as codes", () => {
    deepStrictEqual(parseDevVerifyArgs(["F2", "full"]), { ok: true, args: { batch: "F2", plan: null, mode: "full", gateOnly: false } });
  });
});

describe("parseDevLearnArgs", () => {
  const refused = (tokens: string[]): string => {
    const r = parseDevLearnArgs(tokens);
    return r.ok ? "(accepted)" : r.text;
  };
  const args = (tokens: string[]): DevLearnArgs | null => {
    const r = parseDevLearnArgs(tokens);
    return r.ok ? r.args : null;
  };

  it("refuses each malformed line with its own text", () => {
    strictEqual(DEV_LEARN_USAGE, "usage: /dev-learn [<axis>] [--list] | --accept <id>[,<id>…] | --refuse <id | motif text>");
    strictEqual(refused(["--accept"]), "dev-learn: --accept needs at least one proposal id, e.g. --accept 3f2a9c1e");
    strictEqual(refused(["--accept", ","]), "dev-learn: --accept needs at least one proposal id, e.g. --accept 3f2a9c1e");
    strictEqual(refused(["--accept", "3f2a9c1e,xyz"]), "dev-learn: 'xyz' is not a proposal id (8 or 10 hex digits, from PROPOSALS.md)");
    strictEqual(refused(["--accept", "3f2a9c1"]), "dev-learn: '3f2a9c1' is not a proposal id (8 or 10 hex digits, from PROPOSALS.md)");
    strictEqual(refused(["--refuse"]), "dev-learn: --refuse needs a proposal id or the motif's words");
    strictEqual(refused(["--refuse", "x".repeat(201)]), "dev-learn: a refused motif is at most 200 characters");
    strictEqual(refused(["Test", "--accept", "3f2a9c1e"]), "dev-learn: --accept and --refuse each come alone");
    strictEqual(refused(["--list", "--refuse", "x"]), "dev-learn: --accept and --refuse each come alone");
    strictEqual(refused(["--accept", "3f2a9c1e", "--refuse", "x"]), "dev-learn: --accept and --refuse each come alone");
    strictEqual(refused(["--refuse", "x", "--accept", "3f2a9c1e"]), "dev-learn: --accept and --refuse each come alone");
    strictEqual(refused(["Test", "Scope"]), "dev-learn: one axis at most, not 'Test' and 'Scope'");
    strictEqual(refused(["a|b"]), "dev-learn: 'a|b' is not an axis");
    strictEqual(refused(["x".repeat(41)]), `dev-learn: '${"x".repeat(41)}' is not an axis`);
    strictEqual(refused(["--raw", "--accept", "3f2a9c1e"]), "dev-learn: unknown option '--raw' (--list, --accept, --refuse)");
  });

  it("reads the axis and --list in any order, propose by default", () => {
    deepStrictEqual(args([]), { kind: "propose", axis: null });
    deepStrictEqual(args(["Test"]), { kind: "propose", axis: "Test" });
    deepStrictEqual(args(["--list"]), { kind: "list", axis: null });
    deepStrictEqual(args(["Test", "--list"]), { kind: "list", axis: "Test" });
    deepStrictEqual(args(["--list", "naming"]), { kind: "list", axis: "naming" });
  });

  it("lower-cases the accepted ids and joins the refused words", () => {
    deepStrictEqual(args(["--accept", "3F2A9C1E,77b0d2aa"]), { kind: "accept", ids: ["3f2a9c1e", "77b0d2aa"] });
    deepStrictEqual(args(["--accept", "3f2a9c1e,", "77b0d2aa01"]), { kind: "accept", ids: ["3f2a9c1e", "77b0d2aa01"] });
    deepStrictEqual(args(["--refuse", "rounding", "inside", "handlers"]), { kind: "refuse", target: "rounding inside handlers" });
    deepStrictEqual(args(["--refuse", "3F2A9C1E"]), { kind: "refuse", target: "3f2a9c1e" });
    deepStrictEqual(args(["--refuse", "Rounding", "Inside"]), { kind: "refuse", target: "Rounding Inside" });
    strictEqual(parseDevLearnArgs(["--refuse", "x", "--list"]).ok, false);
  });
});

const LEARN_DIR = "/workspace/workbench/learn-2026-10-21";
const STATE = "/workspace/.orkeon/dev-learn-state.json";
const REFUSED = "/workspace/.orkeon/memory/refused.md";
const REMOTE = "git remote get-url origin";
const NOW = () => new Date(2026, 9, 22, 14, 5);

function motif(id: string, kind: "harness" | "repository", rows: string[], title: string, topic: string): Motif {
  const path = kind === "harness"
    ? ".devcontainer/harness/packs/dev/claude/skills/dev-verify/references/audit-axes.md"
    : "CONTRIBUTING.md";
  return {
    id, title, topic, rows, batches: ["demo/F1", "demo/F2", "demo/F3"],
    preventiveLine: "Each refusal path has its own test.", owner: { kind, path },
    check: "test", status: "new", linesRemoved: [], linesAdded: ["Each refusal path has its own test."],
    novelty: "the owner names no refusal path", keyTerm: "refusal", reconcile: "owner read; term not found",
  };
}

const HARNESS_MOTIF = motif("3f2a9c1e", "harness", ["68abc1ec48", "1111111111"], "Refusal paths go untested", "refusal-paths-untested");
const REPO_MOTIF = motif("77b0d2aa", "repository", ["2222222222"], "Fixtures drift from the format", "fixtures-drift");

function proposals(): ProposalsFile {
  const axis: AxisProposal = {
    axis: "Test", batches: 3, gaps: 4, shownRows: ["68abc1ec48", "1111111111", "2222222222", "3333333333"],
    hiddenRows: 0, outcome: "proposed", motifs: [HARNESS_MOTIF, REPO_MOTIF], dropped: [],
  };
  return {
    version: 1, date: "2026-10-21", work: "workbench",
    read: { files: 3, gaps: 4, batches: 3, treatedOrkeon: 0, treatedHarness: 0, refused: 0 }, axes: [axis],
  };
}

/** The demo fixture plus one learn-<date>/ folder holding the two motifs. */
function learnSetup() {
  const deps = { ...setup(), clock: NOW };
  deps.files.listings.set("/workspace/workbench", ["demo", "learn-2026-10-21"]);
  deps.files.files.set(`${LEARN_DIR}/proposals.json`, serializeProposalsFile(proposals()));
  deps.shell.results[REMOTE] = { exitCode: 0, stdout: "https://github.com/Orkeon/orkeon-code.git\n" };
  return deps;
}

const decide = (deps: ReturnType<typeof learnSetup>, a: Extract<DevLearnArgs, { kind: "accept" | "refuse" }>) =>
  runDevLearnDecision(a, deps);
const writtenPaths = (deps: ReturnType<typeof learnSetup>): string[] => deps.files.writes.map((w) => w.path);
const stateOf = (deps: ReturnType<typeof learnSetup>) => {
  const read = parseLearnState(deps.files.files.get(STATE) ?? null);
  if (!read.ok) throw new Error(read.problem);
  return read.state;
};
const noHarnessWrite = (deps: ReturnType<typeof learnSetup>): void =>
  ok(writtenPaths(deps).every((p) => !p.startsWith("/workspace/.claude/")), writtenPaths(deps).join(", "));

describe("/dev-learn --accept", () => {
  it("prints the patch of a harness motif and writes the state only", async () => {
    const deps = learnSetup();
    const text = await decide(deps, { kind: "accept", ids: ["3f2a9c1e"] });
    deepStrictEqual(text.split("\n"), [
      PROBE_WARNING,
      "accepted 3f2a9c1e — Refusal paths go untested: a harness file is never edited here; apply this in the orkeon-workshop repository:",
      "  file: .devcontainer/harness/packs/dev/claude/skills/dev-verify/references/audit-axes.md",
      "  + Each refusal path has its own test.",
      "state: .orkeon/dev-learn-state.json — 2 gaps treated in all",
    ]);
    deepStrictEqual(writtenPaths(deps), [STATE]);
    deepStrictEqual(stateOf(deps), {
      version: 1, treated: ["1111111111", "68abc1ec48"],
      decisions: [{ motif: "3f2a9c1e", decision: "accepted", date: "2026-10-22", axis: "Test", title: "Refusal paths go untested" }],
    });
    noHarnessWrite(deps);
  });

  it("prints the change of a repository motif and writes no owner file", async () => {
    const deps = learnSetup();
    const text = await decide(deps, { kind: "accept", ids: ["77b0d2aa"] });
    ok(text.includes("accepted 77b0d2aa — Fixtures drift from the format: CONTRIBUTING.md is not edited by /dev-learn; make the change in a batch (/dev-change, or by hand):"), text);
    deepStrictEqual(writtenPaths(deps), [STATE]);
  });

  it("marks the axis's shown rows treated once every motif of it is decided", async () => {
    const deps = learnSetup();
    const text = await decide(deps, { kind: "accept", ids: ["3f2a9c1e", "77b0d2aa"] });
    const lines = text.split("\n");
    ok(lines.includes("axis Test done: 4 gaps marked treated"), text);
    strictEqual(lines.at(-1), "state: .orkeon/dev-learn-state.json — 4 gaps treated in all");
    deepStrictEqual(stateOf(deps).treated, ["1111111111", "2222222222", "3333333333", "68abc1ec48"]);
    deepStrictEqual(writtenPaths(deps), [STATE]);
  });

  it("says an id is already decided, or unknown, and writes nothing then", async () => {
    const deps = learnSetup();
    deps.files.files.set(STATE, serializeLearnState({
      version: 1, treated: ["9999999999"],
      decisions: [{ motif: "3f2a9c1e", decision: "refused", date: "2026-10-21", axis: "Test", title: "Refusal paths go untested" }],
    }));
    const text = await decide(deps, { kind: "accept", ids: ["3f2a9c1e", "deadbeef"] });
    deepStrictEqual(text.split("\n"), [
      PROBE_WARNING,
      "3f2a9c1e was already refused on 2026-10-21",
      "dev-learn: no proposal deadbeef in the 10 newest workbench/learn-*/ folders",
      "state: .orkeon/dev-learn-state.json — 1 gaps treated in all",
    ]);
    deepStrictEqual(deps.files.writes, []);
  });

  it("refuses an invalid state and never overwrites it", async () => {
    const deps = learnSetup();
    deps.files.files.set(STATE, "{ not json");
    const text = await decide(deps, { kind: "accept", ids: ["3f2a9c1e"] });
    const last = text.split("\n").at(-1) ?? "";
    ok(last.startsWith("dev-learn: .orkeon/dev-learn-state.json is not JSON ("), last);
    ok(last.endsWith("): fix or delete it; nothing was written"), last);
    deepStrictEqual(deps.files.writes, []);
  });

  it("warns on an unreadable proposals.json and looks further", async () => {
    const deps = learnSetup();
    deps.files.listings.set("/workspace/workbench", ["demo", "learn-2026-10-21", "learn-2026-10-22"]);
    deps.files.files.set("/workspace/workbench/learn-2026-10-22/proposals.json", "[]");
    const text = await decide(deps, { kind: "accept", ids: ["3f2a9c1e"] });
    ok(text.includes("warning: workbench/learn-2026-10-22/proposals.json cannot be read (the top level has the wrong shape)"), text);
    ok(text.includes("accepted 3f2a9c1e — "), text);
  });

  it("says BLOCKED when the state cannot be written", async () => {
    const deps = learnSetup();
    deps.files.write = async () => { throw new Error("read-only mount"); };
    const text = await decide(deps, { kind: "accept", ids: ["3f2a9c1e"] });
    strictEqual(text.split("\n").at(-1), "dev-learn: BLOCKED — .orkeon/dev-learn-state.json cannot be written (read-only mount)");
  });
});

describe("/dev-learn --refuse", () => {
  it("refuses a motif by its id: the refused.md line, the project from the remote, the rows treated", async () => {
    const deps = learnSetup();
    const text = await decide(deps, { kind: "refuse", target: "3f2a9c1e" });
    deepStrictEqual(text.split("\n"), [
      PROBE_WARNING,
      "refused: refusal-paths-untested — left out of future proposals (.orkeon/memory/refused.md)",
      "state: .orkeon/dev-learn-state.json — 2 gaps treated in all",
    ]);
    deepStrictEqual(writtenPaths(deps), [REFUSED, STATE]);
    ok((deps.files.files.get(REFUSED) ?? "").endsWith(
      "\nrefusal-paths-untested | orkeon-code | 2026-10-22 | Refusal paths go untested\n"));
    ok((deps.files.files.get(REFUSED) ?? "").startsWith("# Refused motifs\n"));
    strictEqual(stateOf(deps).decisions[0].decision, "refused");
    ok(deps.shell.commands.includes(REMOTE));
    noHarnessWrite(deps);
  });

  it("refuses free text: a topic from the words, no row treated, no state written", async () => {
    const deps = learnSetup();
    const text = await decide(deps, { kind: "refuse", target: "Règle d'or: pas de I/O" });
    strictEqual(text.split("\n").at(-1), "refused: regle-d-or-pas-de-i-o — left out of future proposals (.orkeon/memory/refused.md)");
    deepStrictEqual(writtenPaths(deps), [REFUSED]);
    ok((deps.files.files.get(REFUSED) ?? "").includes("\nregle-d-or-pas-de-i-o | orkeon-code | 2026-10-22 | Règle d'or: pas de I/O\n"));
  });

  it("does not append a topic refused already", async () => {
    const deps = learnSetup();
    await decide(deps, { kind: "refuse", target: "rounding inside handlers" });
    const before = deps.files.files.get(REFUSED);
    const text = await decide(deps, { kind: "refuse", target: "Rounding inside handlers" });
    strictEqual(text.split("\n").at(-1), "rounding-inside-handlers was already refused on 2026-10-22");
    strictEqual(deps.files.files.get(REFUSED), before);
    strictEqual(deps.files.writes.length, 1);
  });

  it("names the project local when the remote fails or throws", async () => {
    for (const fail of ["exit", "throw"]) {
      const deps = learnSetup();
      if (fail === "exit") deps.shell.results[REMOTE] = { exitCode: 2, stdout: "", stderr: "error: No such remote 'origin'" };
      else deps.shell.errors[REMOTE] = new Error("command refused");
      await decide(deps, { kind: "refuse", target: "rounding inside handlers" });
      ok((deps.files.files.get(REFUSED) ?? "").includes("\nrounding-inside-handlers | local | 2026-10-22 | rounding inside handlers\n"), fail);
    }
  });

  it("refuses an id-shaped target that no proposal holds", async () => {
    const deps = learnSetup();
    const text = await decide(deps, { kind: "refuse", target: "deadbeef" });
    strictEqual(text.split("\n").at(-1),
      "dev-learn: no proposal deadbeef in the 10 newest workbench/learn-*/ folders (to refuse a motif by its words, write more than an id)");
    deepStrictEqual(deps.files.writes, []);
  });

  it("says when there is no work folder", async () => {
    const deps = learnSetup();
    deps.files.listings.set("/workspace", []);
    const text = await decide(deps, { kind: "refuse", target: "anything" });
    strictEqual(text, "dev-learn: no work folder workbench/: nothing to learn from");
    deepStrictEqual(deps.files.writes, []);
  });
});

describe("parseDevPlanArgs", () => {
  const refused = (tokens: string[]): string => {
    const r = parseDevPlanArgs(tokens);
    return r.ok ? "(accepted)" : r.text;
  };

  it("takes at most one source and --replace anywhere", () => {
    strictEqual(DEV_PLAN_USAGE, "usage: /dev-plan [<code> | <path>/SPEC-<code>.md | <path>/CHANGE-<code>.md] [--replace]");
    deepStrictEqual(parseDevPlanArgs([]), { ok: true, args: { source: null, replace: false } });
    deepStrictEqual(parseDevPlanArgs(["--replace", "prune"]), { ok: true, args: { source: "prune", replace: true } });
    deepStrictEqual(parseDevPlanArgs(["workbench/prune/CHANGE-prune.md", "--replace"]),
      { ok: true, args: { source: "workbench/prune/CHANGE-prune.md", replace: true } });
    deepStrictEqual(parseDevPlanArgs(["--replace"]), { ok: true, args: { source: null, replace: true } });
  });

  it("refuses each malformed line with its own text", () => {
    strictEqual(refused(["--force"]), "dev-plan: unknown option '--force' (only --replace)");
    strictEqual(refused(["prune", "demo"]), "dev-plan: one source at most, not 'prune' and 'demo'");
    strictEqual(refused(["a/b"]), "dev-plan: 'a/b' is neither a code nor a SPEC-<code>.md / CHANGE-<code>.md path");
    strictEqual(refused(["../x/SPEC-x.md"]), "dev-plan: '../x/SPEC-x.md' is neither a code nor a SPEC-<code>.md / CHANGE-<code>.md path");
    strictEqual(refused(["--replace", "--replace"]), "dev-plan: --replace once at most");
  });
});

describe("devPlanGate", () => {
  const SPEC = "/workspace/workbench/demo/SPEC-demo.md";
  const BLOCKED_SPEC = [
    "# demo — Demo feature",
    "",
    "## 12. Open questions",
    "",
    "| # | Severity | Question |",
    "|---|---|---|",
    "| 1 | Blocking | Which clock rounds the cut-off? |",
    "| 2 | Major | Is a dry run logged? |",
    "",
    "## 13. Notes",
    "",
  ].join("\n");

  it("lets a source with no Blocking question through to the crew", async () => {
    strictEqual(await devPlanGate({ source: "demo", replace: false }, setup()), null);
  });

  it("stops on a Blocking row with the rows and the next command, and writes nothing", async () => {
    const deps = setup();
    deps.files.files.set(SPEC, BLOCKED_SPEC);
    strictEqual(await devPlanGate({ source: "demo", replace: true }, deps), [
      "dev-plan: workbench/demo/SPEC-demo.md has 1 open Blocking question(s); no plan is written.",
      "  | 1 | Blocking | Which clock rounds the cut-off? |",
      "→ Settle them first: /dev-spec demo, or edit the file; then /dev-plan demo.",
    ].join("\n"));
    deepStrictEqual(deps.files.writes, []);
  });

  it("returns the refusal of a code with no spec nor brief", async () => {
    const deps = setup();
    deps.files.listings.set("/workspace/workbench/nope", ["notes.txt"]);
    strictEqual(await devPlanGate({ source: "nope", replace: false }, deps),
      "dev-plan: workbench/nope/ holds no SPEC-nope.md nor CHANGE-nope.md");
  });

  it("refuses with no argument when no code is left to plan", async () => {
    // The demo code already has its plan.
    strictEqual(await devPlanGate({ source: null, replace: false }, setup()),
      "dev-plan: no SPEC- or CHANGE- file without a plan in workbench/: name one, e.g. /dev-plan <code>");
  });

  it("leaves a thrown error to the crew", async () => {
    // A read answering no text makes the parser throw past every refusal the gate knows.
    const deps = setup();
    const read = deps.files.read.bind(deps.files);
    deps.files.read = async (path: string, max?: number) => (path === SPEC ? (undefined as unknown as string) : read(path, max));
    strictEqual(await devPlanGate({ source: "demo", replace: false }, deps), null);
  });
});
