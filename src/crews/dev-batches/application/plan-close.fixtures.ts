// The plan /dev-batches closes: the code demo with no plan file read, a pack whose layout names three roots, the
// batches merged in the run, and a FakeShell answering the close's git on a branch, with FakeFiles, a config store
// on them and a FakePullRequestOpener.
import { FakeFiles } from "../../../../tests/support/doubles/fake-files.ts";
import { FakePullRequestOpener } from "../../../../tests/support/doubles/fake-pull-request-opener.ts";
import { FakeSessionStore } from "../../../../tests/support/doubles/fake-session-store.ts";
import { FakeShell } from "../../../../tests/support/doubles/fake-shell.ts";
import { USER_CONFIG_FILE_PATH, createConfigStore } from "../../../shared/application/config-store.ts";
import type { DevCode } from "../../../shared/application/dev/load-dev-context.ts";
import type { WorkFolder } from "../../../shared/application/dev/resolve-work-folder.ts";
import type { RepoPack } from "../../../shared/domain/dev/repo-pack.ts";
import type { PermissionRule } from "../../../shared/domain/agent-policy/permission.ts";
import {
  GIT_CURRENT_BRANCH_COMMAND, GIT_DEFAULT_BRANCH_COMMAND, gitPushCommand, gitPushedCheckCommand, shellQuote,
} from "../../../shared/domain/git/close.ts";
import type { MergedBatch, PlanCloseInput } from "./plan-close.ts";
import { WORKSPACE } from "../../../shared/domain/vfs.ts";

export const BRANCH = "feat/demo";

/** A pack whose layout names a domain, an application and a tests root, and no infrastructure one. */
export const PACK: RepoPack = {
  layout: { domain: "src/domain", application: "src/app", tests: "tests", shared: [], buildOutputs: [] },
  commands: {}, tests: {}, accessCost: { roots: [] }, contrib: {}, document: {},
};

/** PACK asking for a work branch feat/<slug>. */
export const PACK_WITH_BRANCH: RepoPack = { ...PACK, contrib: { branch: "feat/<slug>" } };

/** The paths of the batches' commits, out of order. */
export const PATHS = ["tests/a.test.ts", "README.md", "src/domain/a.ts", "src/app/run.ts", "src/domain"];

export interface LayerCase { name: string; pack: RepoPack | null; layers: Array<{ layer: string; paths: string[] }> }

export const LAYER_CASES: readonly LayerCase[] = [
  {
    name: "puts every path under other, sorted, when there is no pack", pack: null,
    layers: [{ layer: "other", paths: ["README.md", "src/app/run.ts", "src/domain", "src/domain/a.ts", "tests/a.test.ts"] }],
  },
  {
    name: "groups the paths by the pack's layout roots, the others last", pack: PACK,
    layers: [
      { layer: "domain", paths: ["src/domain", "src/domain/a.ts"] },
      { layer: "application", paths: ["src/app/run.ts"] },
      { layer: "tests", paths: ["tests/a.test.ts"] },
      { layer: "other", paths: ["README.md"] },
    ],
  },
];

export const WORK: WorkFolder = {
  folder: "workbench", vfsPath: `${WORKSPACE}/workbench`, outcome: "applied", request: null, exists: true, note: null,
};

/** The code demo with no plan, sheet nor verdict read. */
export function devCode(over: Partial<DevCode> = {}): DevCode {
  return {
    code: "demo", shown: "workbench/demo", spec: null, change: null, plan: null, sheets: [], verdicts: [], state: null, warnings: [],
    ...over,
  };
}

/** The code demo whose plan DEMO-PLAN.md has the prefix DEMO and the feature "Prune old entries". */
export const WITH_PLAN = devCode({
  plan: { name: "DEMO-PLAN.md", plan: { prefix: "DEMO", feature: "Prune old entries", summary: [], batches: [], problems: [] } },
});

/** The code demo whose sheet of F1 holds one assumption. */
export const WITH_ASSUMPTION = devCode({
  sheets: [{
    batch: "F1", name: "DEMO-PLAN-F1.md",
    sheet: { dependsOn: [], steps: [], problems: [], assumptions: [{ id: "A-01", assumption: "the store is local", by: "the sheet" }] },
  }],
});

export const MERGED: readonly MergedBatch[] = [{ batch: "F1", hash: "abc1234" }, { batch: "F2", hash: "" }];

/** The close of the plan demo, the batches F1 then F2 merged (F2 before this run). */
export function closeInput(over: Partial<PlanCloseInput> = {}): PlanCloseInput {
  return { code: "demo", dev: devCode(), pack: null, work: WORK, merged: MERGED, pr: false, rules: [], ...over };
}

export interface SummaryCase { name: string; input: PlanCloseInput; batch: string }

export const SUMMARY_CASES: readonly SummaryCase[] = [
  {
    name: "cites each merged batch with its commit, the code standing for the plan it could not read", input: closeInput(),
    batch: "DEMO — demo: batches F1, F2, from `workbench/demo/?`, one commit each (F1 abc1234, F2 before this run).",
  },
  {
    name: "cites the plan's prefix, feature and file", input: closeInput({ dev: WITH_PLAN }),
    batch: "DEMO — Prune old entries: batches F1, F2, from `workbench/demo/DEMO-PLAN.md`, one commit each (F1 abc1234, F2 before this run).",
  },
  {
    name: "says none when no batch was merged", input: closeInput({ merged: [] }),
    batch: "DEMO — demo: batches none, from `workbench/demo/?`, one commit each ().",
  },
];

/** A session rule denying the push of BRANCH. */
export const DENY_PUSH: PermissionRule[] = [
  { effect: "deny", tool: "shell_command", argument: "command", pattern: gitPushCommand(BRANCH) },
];

/** The close's world: a shell on `branch`, origin's default branch main, the commit of F1 touching two files. */
export function closing(branch = BRANCH) {
  const files = new FakeFiles();
  const shell = new FakeShell();
  shell.results[GIT_CURRENT_BRANCH_COMMAND] = { stdout: `${branch}\n` };
  shell.results[GIT_DEFAULT_BRANCH_COMMAND] = { stdout: "origin/main\n" };
  shell.results[`git show --name-only --format= ${shellQuote("abc1234")}`] = { stdout: "src/domain/a.ts\ntests/a.test.ts\n" };
  const config = createConfigStore({ files, session: new FakeSessionStore() });
  const opener = new FakePullRequestOpener();
  return { files, shell, opener, deps: { files, shell, config, opener } };
}

/** closing(), origin's ref of BRANCH at HEAD already: the branch was pushed by hand. */
export function pushedByHand() {
  const world = closing();
  world.shell.results[gitPushedCheckCommand(BRANCH)] = { stdout: "1111111\n1111111\n" };
  return world;
}

/** closing(), dev.prAuto set to true in the user's configuration (a key only the user sets). */
export function prAuto() {
  const world = closing();
  world.files.files.set(USER_CONFIG_FILE_PATH, JSON.stringify({ "dev.prAuto": "true" }));
  return world;
}

/** closing(), the push refused by the remote. */
export function pushRefused() {
  const world = closing();
  world.shell.results[gitPushCommand(BRANCH)] = { exitCode: 1, stderr: "fatal: could not read from remote repository\n" };
  return world;
}

export const NO_BRANCH_LINE = "✗ close: no current branch (a detached HEAD?): check out the work branch, then /dev-batches demo";
export const WORK_BRANCH_LINE =
  "✗ close: main is the default branch and the pack asks for a work branch (feat/<slug>): git switch feat/demo, then /dev-batches demo";
export const ON_DEFAULT_LINE =
  `✓ every batch is committed on main, the default branch: no pull request; pushing it is yours (${gitPushCommand("main")})`;
export const DENIED_LINE = `✗ not pushed: a session rule denies '${gitPushCommand(BRANCH)}'; the commits stay local`;
