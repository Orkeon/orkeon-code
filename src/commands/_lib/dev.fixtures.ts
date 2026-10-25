// The deps the /dev-status, /dev-learn and /dev-plan tests run over (FakeFiles, FakeShell, a config store on
// FakeFiles), loaded with the fixture work folder tests/fixtures/dev/workbench/demo/, the changes each test makes to
// it, the proposals /dev-learn decides on, and the argument lines with what each parses to.
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { DevLearnArgs, DevPlanArgs, DevVerifyArgs } from "./dev.ts";
import { parseLearnState } from "../../shared/domain/dev/learn-state.ts";
import { serializeProposalsFile } from "../../shared/domain/dev/learn-proposals.ts";
import type { AxisProposal, Motif, ProposalsFile } from "../../shared/domain/dev/learn-proposals.ts";
import { ORKEON_IGNORE_PROBE, checkIgnoreCommand } from "../../shared/application/dev/load-dev-context.ts";
import { GIT_TOPLEVEL, GIT_WORKTREE_LIST, gitDirProbe } from "../../shared/application/dev/resolve-work-folder.ts";
import { createConfigStore } from "../../shared/application/config-store.ts";
import { FakeFiles } from "../../../tests/support/doubles/fake-files.ts";
import { FakeShell } from "../../../tests/support/doubles/fake-shell.ts";
import { FakeSessionStore } from "../../../tests/support/doubles/fake-session-store.ts";
import { WORKSPACE } from "../../shared/domain/vfs.ts";

const DEMO_DIR = fileURLToPath(new URL("../../../tests/fixtures/dev/workbench/demo/", import.meta.url));
const BOTH = checkIgnoreCommand([ORKEON_IGNORE_PROBE, "workbench/"]);

export const PROBE_WARNING =
  "warning: .orkeon/config.json is not ignored by git: add it to .gitignore (Orkeon Code never edits it)";

export const DEMO_PLAN = `${WORKSPACE}/workbench/demo/DEMO-PLAN.md`;
export const SPEC = `${WORKSPACE}/workbench/demo/SPEC-demo.md`;

/** The demo fixture at /workspace/workbench/demo; git ignores workbench/ but not the probe. */
export function devDeps() {
  const files = new FakeFiles();
  const shell = new FakeShell();
  const config = createConfigStore({ files, session: new FakeSessionStore() });
  const names = readdirSync(DEMO_DIR).sort();
  for (const name of names) files.files.set(`${WORKSPACE}/workbench/demo/${name}`, readFileSync(DEMO_DIR + name, "utf-8"));
  files.listings.set(WORKSPACE, ["workbench"]);
  files.listings.set(`${WORKSPACE}/workbench`, ["demo"]);
  files.listings.set(`${WORKSPACE}/workbench/demo`, names);
  shell.results[BOTH] = { exitCode: 0, stdout: "workbench/\n" };
  return { files, shell, config };
}

export type DevDeps = ReturnType<typeof devDeps>;

/** What /dev-status demo prints over the fixture. */
export const DEMO_STATUS_LINES = [
  "work folder: workbench/ (default)",
  "pack: none",
  'code: workbench/demo/ — spec SPEC-demo.md — plan DEMO-PLAN.md "Demo feature" (3 batches, 1 done)',
  "F1 Parsers — done 2026-10-20 — boxes 3/3 — sheet RED 2/2 GREEN 2/2 COST 2/2 — VALID 2026-10-20 14:02 fast (1 Minor)",
  "F2 Command — open — boxes 1/3 — sheet RED 1/2 GREEN 0/2 COST 0/2 — GAPS 2026-10-21 09:40 resume: 1 Major",
  "F3 Docs — open — boxes 0/2 — sheet RED 0/1 GREEN 0/1 COST 0/1 — no verdict",
  PROBE_WARNING,
];

export const RELAUNCHED_F2_END = " — GAPS 2026-10-21 09:40 resume: 1 Major — running (relaunched 2026-10-21 09:45)";

/** The batches log records F2 relaunched after its verdict. */
export function relaunchF2(deps: DevDeps): void {
  const log = `${WORKSPACE}/workbench/demo/DEMO-BATCHES-STATE.md`;
  deps.files.files.set(log, `${deps.files.files.get(log) ?? ""}- 2026-10-21 09:45 F2 relaunched\n`);
}

/** The plan says F3 done with open ticks, F2 has a VALID verdict the plan does not record, a sheet F7 the plan lacks. */
export function makeFilesDisagree(deps: DevDeps): void {
  const text = deps.files.files.get(DEMO_PLAN) ?? "";
  deps.files.files.set(DEMO_PLAN, text.replace("### Batch F3 — Docs — open", "### Batch F3 — Docs — done (2026-10-22)"));
  deps.files.files.set(`${WORKSPACE}/workbench/demo/DEMO-VERIFY-F2.md`,
    "# DEMO-VERIFY-F2 — 2026-10-22 08:00 — fast\n\n## Verdict — VALID\n\nNone.\n");
  deps.files.files.set(`${WORKSPACE}/workbench/demo/DEMO-PLAN-F7.md`, "# DEMO-PLAN-F7 — Stray\n");
  deps.files.listings.get(`${WORKSPACE}/workbench/demo`)?.push("DEMO-PLAN-F7.md");
}

export const DISAGREEMENT_WARNINGS = [
  PROBE_WARNING,
  "warning: F2 is VALID but the plan still says open",
  "warning: F3 is done in the plan but its sheet has open ticks (RED 0/1)",
  "warning: DEMO-PLAN-F7.md has no batch line in the plan",
];

export const CODES_LINES = [
  "work folder: workbench/ (default)",
  "pack: none",
  "codes (1): demo — spec, plan, 3 sheets, 2 verdicts",
  PROBE_WARNING,
];

/** Thirty codes code-00 … code-29, each with a spec and a plan, replace the demo. */
export function thirtyCodes(deps: DevDeps): string[] {
  const codes = Array.from({ length: 30 }, (_, i) => `code-${String(i).padStart(2, "0")}`);
  deps.files.listings.set(`${WORKSPACE}/workbench`, codes);
  for (const c of codes) deps.files.listings.set(`${WORKSPACE}/workbench/${c}`, [`SPEC-${c}.md`, `${c}-PLAN.md`]);
  return codes;
}

/** Listing the work folder fails with "permission denied". */
export function failWorkFolderListing(deps: DevDeps): void {
  deps.files.list = async (path: string, max: number) => {
    if (path === `${WORKSPACE}/workbench`) throw new Error("permission denied");
    return (deps.files.listings.get(path) ?? []).slice(0, max);
  };
}

/** A folder `bare` beside demo that holds no artefact. */
export function addBareFolder(deps: DevDeps): void {
  deps.files.listings.set(`${WORKSPACE}/workbench`, ["demo", "bare"]);
  deps.files.listings.set(`${WORKSPACE}/workbench/bare`, ["notes.md"]);
}

/** The checkout is a linked worktree whose work folder, `tasks`, is the main worktree's /home/main/tasks. */
export function linkedWorktree(deps: DevDeps): void {
  deps.files.files.set(`${WORKSPACE}/.orkeon/config.json`, JSON.stringify({ "dev.workDir": "tasks" }));
  deps.shell.results[GIT_WORKTREE_LIST] = { stdout: "worktree /home/main\nHEAD 0000000\nbranch refs/heads/main\n" };
  deps.shell.results[GIT_TOPLEVEL] = { stdout: `${WORKSPACE}\n` };
  deps.shell.results[gitDirProbe("/home/main/tasks")] = { exitCode: 0, stdout: ".git\n" };
  deps.shell.results[checkIgnoreCommand([ORKEON_IGNORE_PROBE])] = { exitCode: 0, stdout: ".orkeon/config.json\n" };
}

export const LINKED_WORKTREE_REFUSAL =
  "dev-status: the work folder /home/main/tasks is in the main worktree, outside the mounts: " +
  "run /dev-status from the main checkout";

export const LINKED_WORKTREE_LINES = [
  "work folder: /home/main/tasks/ (dev.workDir)",
  "pack: none",
  "warning: this checkout is a linked worktree: the work folder is the main worktree's /home/main/tasks",
];

/** A plan of 40 batches with long names and states, and 12 stray sheets the plan lacks. */
export function fortyBatchPlan(deps: DevDeps): void {
  const name = "X".repeat(30);
  const state = `waiting on review by the other team ${"y".repeat(80)}`;
  const batches = Array.from({ length: 40 }, (_, i) => `### Batch F${i + 1} — ${name} — ${state}\n- [x] 1. a\n`).join("\n");
  deps.files.files.set(DEMO_PLAN, `# DEMO-PLAN — f\n\n${batches}`);
  const stray = Array.from({ length: 12 }, (_, i) => `DEMO-PLAN-F${100 + i}.md`);
  for (const n of stray) deps.files.files.set(`${WORKSPACE}/workbench/demo/${n}`, `# ${n} — x\n`);
  deps.files.listings.get(`${WORKSPACE}/workbench/demo`)?.push(...stray);
}

// ── argument lines ───────────────────────────────────────────────────────

export interface RefusedLineCase {
  name: string;
  tokens: string[];
  text: string;
}

export const VERIFY_USAGE_TEXT =
  "usage: /dev-verify F<n> [<code> | <path>/<CODE>-PLAN.md] [fast | full | resume] [--gate-only]";

export const VERIFY_REFUSED_CASES: readonly RefusedLineCase[] = [
  { name: "refuses an empty line with the usage", tokens: [], text: VERIFY_USAGE_TEXT },
  { name: "refuses a first token that is not a batch", tokens: ["demo"], text: "dev-verify: 'demo' is not a batch: F<n>, e.g. F2" },
  { name: "refuses two modes", tokens: ["F2", "fast", "resume"], text: "dev-verify: one mode at most (fast, full or resume), not 'fast' and 'resume'" },
  { name: "refuses an unknown option", tokens: ["F2", "--raw"], text: "dev-verify: unknown option '--raw' (only --gate-only)" },
  { name: "refuses two plans", tokens: ["F2", "demo", "other"], text: "dev-verify: one plan at most, not 'demo' and 'other'" },
  { name: "refuses a path that is not a plan", tokens: ["F2", "a/b"], text: "dev-verify: 'a/b' is neither a code nor a <CODE>-PLAN.md path" },
  {
    name: "refuses a plan path climbing out",
    tokens: ["F2", "../x/DEMO-PLAN.md"],
    text: "dev-verify: '../x/DEMO-PLAN.md' is neither a code nor a <CODE>-PLAN.md path",
  },
  {
    name: "refuses an absolute plan path",
    tokens: ["F2", "/etc/DEMO-PLAN.md"],
    text: "dev-verify: '/etc/DEMO-PLAN.md' is neither a code nor a <CODE>-PLAN.md path",
  },
];

export const VERIFY_ACCEPTED_CASES: readonly { name: string; tokens: string[]; args: DevVerifyArgs }[] = [
  {
    name: "takes the other tokens in any order",
    tokens: ["F2", "resume", "demo", "--gate-only"],
    args: { batch: "F2", plan: "demo", mode: "resume", gateOnly: true },
  },
  { name: "takes fast by default", tokens: ["F2", "--gate-only"], args: { batch: "F2", plan: null, mode: "fast", gateOnly: true } },
  {
    name: "takes a plan path and a mode",
    tokens: ["F12", "workbench/demo/DEMO-PLAN.md", "full"],
    args: { batch: "F12", plan: "workbench/demo/DEMO-PLAN.md", mode: "full", gateOnly: false },
  },
  { name: "reads fast, full and resume as modes, never as codes", tokens: ["F2", "full"], args: { batch: "F2", plan: null, mode: "full", gateOnly: false } },
];

export const LEARN_USAGE_TEXT = "usage: /dev-learn [<axis>] [--list] | --accept <id>[,<id>…] | --refuse <id | motif text>";

const ALONE = "dev-learn: --accept and --refuse each come alone";
const NO_ID = "dev-learn: --accept needs at least one proposal id, e.g. --accept 3f2a9c1e";

export const LEARN_REFUSED_CASES: readonly RefusedLineCase[] = [
  { name: "refuses --accept without an id", tokens: ["--accept"], text: NO_ID },
  { name: "refuses --accept with only a comma", tokens: ["--accept", ","], text: NO_ID },
  {
    name: "refuses an accepted id that is not hex",
    tokens: ["--accept", "3f2a9c1e,xyz"],
    text: "dev-learn: 'xyz' is not a proposal id (8 or 10 hex digits, from PROPOSALS.md)",
  },
  {
    name: "refuses an accepted id of 7 digits",
    tokens: ["--accept", "3f2a9c1"],
    text: "dev-learn: '3f2a9c1' is not a proposal id (8 or 10 hex digits, from PROPOSALS.md)",
  },
  { name: "refuses --refuse without a target", tokens: ["--refuse"], text: "dev-learn: --refuse needs a proposal id or the motif's words" },
  { name: "refuses a motif of more than 200 characters", tokens: ["--refuse", "x".repeat(201)], text: "dev-learn: a refused motif is at most 200 characters" },
  { name: "refuses --accept after an axis", tokens: ["Test", "--accept", "3f2a9c1e"], text: ALONE },
  { name: "refuses --refuse after --list", tokens: ["--list", "--refuse", "x"], text: ALONE },
  { name: "refuses --accept with --refuse", tokens: ["--accept", "3f2a9c1e", "--refuse", "x"], text: ALONE },
  { name: "refuses --refuse with --accept", tokens: ["--refuse", "x", "--accept", "3f2a9c1e"], text: ALONE },
  { name: "refuses two axes", tokens: ["Test", "Scope"], text: "dev-learn: one axis at most, not 'Test' and 'Scope'" },
  { name: "refuses an axis with a pipe", tokens: ["a|b"], text: "dev-learn: 'a|b' is not an axis" },
  { name: "refuses an axis of more than 40 characters", tokens: ["x".repeat(41)], text: `dev-learn: '${"x".repeat(41)}' is not an axis` },
  {
    name: "refuses an unknown option",
    tokens: ["--raw", "--accept", "3f2a9c1e"],
    text: "dev-learn: unknown option '--raw' (--list, --accept, --refuse)",
  },
];

export const LEARN_ACCEPTED_CASES: readonly { name: string; tokens: string[]; args: DevLearnArgs }[] = [
  { name: "proposes by default", tokens: [], args: { kind: "propose", axis: null } },
  { name: "reads an axis to propose on", tokens: ["Test"], args: { kind: "propose", axis: "Test" } },
  { name: "reads --list", tokens: ["--list"], args: { kind: "list", axis: null } },
  { name: "reads the axis before --list", tokens: ["Test", "--list"], args: { kind: "list", axis: "Test" } },
  { name: "reads the axis after --list", tokens: ["--list", "naming"], args: { kind: "list", axis: "naming" } },
  { name: "lower-cases the accepted ids", tokens: ["--accept", "3F2A9C1E,77b0d2aa"], args: { kind: "accept", ids: ["3f2a9c1e", "77b0d2aa"] } },
  {
    name: "reads accepted ids split after a comma",
    tokens: ["--accept", "3f2a9c1e,", "77b0d2aa01"],
    args: { kind: "accept", ids: ["3f2a9c1e", "77b0d2aa01"] },
  },
  {
    name: "joins the refused words",
    tokens: ["--refuse", "rounding", "inside", "handlers"],
    args: { kind: "refuse", target: "rounding inside handlers" },
  },
  { name: "lower-cases a refused id", tokens: ["--refuse", "3F2A9C1E"], args: { kind: "refuse", target: "3f2a9c1e" } },
  { name: "keeps the case of refused words", tokens: ["--refuse", "Rounding", "Inside"], args: { kind: "refuse", target: "Rounding Inside" } },
];

export const PLAN_USAGE_TEXT = "usage: /dev-plan [<code> | <path>/SPEC-<code>.md | <path>/CHANGE-<code>.md] [--replace]";

export const PLAN_ACCEPTED_CASES: readonly { name: string; tokens: string[]; args: DevPlanArgs }[] = [
  { name: "takes no source", tokens: [], args: { source: null, replace: false } },
  { name: "takes --replace before the source", tokens: ["--replace", "prune"], args: { source: "prune", replace: true } },
  {
    name: "takes --replace after a source path",
    tokens: ["workbench/prune/CHANGE-prune.md", "--replace"],
    args: { source: "workbench/prune/CHANGE-prune.md", replace: true },
  },
  { name: "takes --replace alone", tokens: ["--replace"], args: { source: null, replace: true } },
];

export const PLAN_REFUSED_CASES: readonly RefusedLineCase[] = [
  { name: "refuses an unknown option", tokens: ["--force"], text: "dev-plan: unknown option '--force' (only --replace)" },
  { name: "refuses two sources", tokens: ["prune", "demo"], text: "dev-plan: one source at most, not 'prune' and 'demo'" },
  { name: "refuses a path that is no source", tokens: ["a/b"], text: "dev-plan: 'a/b' is neither a code nor a SPEC-<code>.md / CHANGE-<code>.md path" },
  {
    name: "refuses a source path climbing out",
    tokens: ["../x/SPEC-x.md"],
    text: "dev-plan: '../x/SPEC-x.md' is neither a code nor a SPEC-<code>.md / CHANGE-<code>.md path",
  },
  { name: "refuses --replace twice", tokens: ["--replace", "--replace"], text: "dev-plan: --replace once at most" },
];

// ── /dev-learn decisions ─────────────────────────────────────────────────

export const LEARN_DIR = `${WORKSPACE}/workbench/learn-2026-10-21`;
export const STATE = `${WORKSPACE}/.orkeon/dev-learn-state.json`;
export const REFUSED = `${WORKSPACE}/.orkeon/memory/refused.md`;
export const REMOTE = "git remote get-url origin";
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
export function learnDeps() {
  const deps = { ...devDeps(), clock: NOW };
  deps.files.listings.set(`${WORKSPACE}/workbench`, ["demo", "learn-2026-10-21"]);
  deps.files.files.set(`${LEARN_DIR}/proposals.json`, serializeProposalsFile(proposals()));
  deps.shell.results[REMOTE] = { exitCode: 0, stdout: "https://github.com/Orkeon/orkeon-code.git\n" };
  return deps;
}

export type LearnDeps = ReturnType<typeof learnDeps>;

/** The paths written, in order. */
export const writtenPaths = (deps: LearnDeps): string[] => deps.files.writes.map((w) => w.path);

/** The /dev-learn state as stored; throws when it cannot be read. */
export function stateOf(deps: LearnDeps) {
  const read = parseLearnState(deps.files.files.get(STATE) ?? null);
  if (!read.ok) throw new Error(read.problem);
  return read.state;
}

/** A state where 3f2a9c1e was refused on 2026-10-21 and one row is treated. */
export const DECIDED_STATE = {
  version: 1 as const, treated: ["9999999999"],
  decisions: [{ motif: "3f2a9c1e", decision: "refused" as const, date: "2026-10-21", axis: "Test", title: "Refusal paths go untested" }],
};

export const HARNESS_ACCEPTED_LINES = [
  PROBE_WARNING,
  "accepted 3f2a9c1e — Refusal paths go untested: a harness file is never edited here; apply this in the orkeon-workshop repository:",
  "  file: .devcontainer/harness/packs/dev/claude/skills/dev-verify/references/audit-axes.md",
  "  + Each refusal path has its own test.",
  "state: .orkeon/dev-learn-state.json — 2 gaps treated in all",
];

export const HARNESS_ACCEPTED_STATE = {
  version: 1, treated: ["1111111111", "68abc1ec48"],
  decisions: [{ motif: "3f2a9c1e", decision: "accepted", date: "2026-10-22", axis: "Test", title: "Refusal paths go untested" }],
};

export const REPO_ACCEPTED_LINE =
  "accepted 77b0d2aa — Fixtures drift from the format: CONTRIBUTING.md is not edited by /dev-learn; make the change in a batch (/dev-change, or by hand):";

export const DECIDED_OR_UNKNOWN_LINES = [
  PROBE_WARNING,
  "3f2a9c1e was already refused on 2026-10-21",
  "dev-learn: no proposal deadbeef in the 10 newest workbench/learn-*/ folders",
  "state: .orkeon/dev-learn-state.json — 1 gaps treated in all",
];

/** A newer learn folder whose proposals.json has the wrong shape. */
export function addUnreadableProposals(deps: LearnDeps): void {
  deps.files.listings.set(`${WORKSPACE}/workbench`, ["demo", "learn-2026-10-21", "learn-2026-10-22"]);
  deps.files.files.set(`${WORKSPACE}/workbench/learn-2026-10-22/proposals.json`, "[]");
}

/** Every write fails with "read-only mount". */
export function failWrites(deps: LearnDeps): void {
  deps.files.write = async () => {
    throw new Error("read-only mount");
  };
}

export const REFUSED_BY_ID_LINES = [
  PROBE_WARNING,
  "refused: refusal-paths-untested — left out of future proposals (.orkeon/memory/refused.md)",
  "state: .orkeon/dev-learn-state.json — 2 gaps treated in all",
];

/** The remote that names the project fails: it exits in error, or the runtime refuses the command. */
export const REMOTE_FAILURES: readonly { name: string; fail(deps: LearnDeps): void }[] = [
  {
    name: "exits in error",
    fail: (deps) => {
      deps.shell.results[REMOTE] = { exitCode: 2, stdout: "", stderr: "error: No such remote 'origin'" };
    },
  },
  {
    name: "throws",
    fail: (deps) => {
      deps.shell.errors[REMOTE] = new Error("command refused");
    },
  },
];

// ── /dev-plan gate ───────────────────────────────────────────────────────

/** A spec with one open Blocking question and one Major one. */
export const BLOCKED_SPEC = [
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

export const BLOCKED_GATE = [
  "dev-plan: workbench/demo/SPEC-demo.md has 1 open Blocking question(s); no plan is written.",
  "  | 1 | Blocking | Which clock rounds the cut-off? |",
  "→ Settle them first: /dev-spec demo, or edit the file; then /dev-plan demo.",
].join("\n");

/** A read of the spec answers no text: the parser throws past every refusal the gate knows. */
export function readSpecAsNothing(deps: DevDeps): void {
  const read = deps.files.read.bind(deps.files);
  deps.files.read = async (path: string, max?: number) => (path === SPEC ? (undefined as unknown as string) : read(path, max));
}
