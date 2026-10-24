// The close of a /dev-batches run, once every batch of the plan is done: one push of the work branch
// and one pull request for the whole plan (source-space D79: the batches commit, the run pushes once).
// The pull request's body lists the files of each batch's commit (`merged <hash>` in the log), grouped by
// the pack's layout roots, each audit's validations, and is written to `<work>/pr-<slug>/PR.md`; it is
// opened through the github tool under --pr or dev.prAuto, else its command is handed over. On the
// default branch nothing is pushed for review. A push that fails leaves the run open: the next
// /dev-batches tries the close again.
import type { Files, Shell } from "../../../shared/application/ports.ts";
import type { ConfigStore } from "../../../shared/application/config-store.ts";
import type { PullRequestOpener } from "../../../shared/application/git/commit-files.ts";
import { defaultBranch, handOverPullRequest, pushBranch, runGit } from "../../../shared/application/git/commit-files.ts";
import type { WorkFolder } from "../../../shared/application/dev/resolve-work-folder.ts";
import type { DevCode } from "../../../shared/application/dev/load-dev-context.ts";
import { lastVerdict } from "../../../shared/domain/dev/verdict-format.ts";
import type { RepoPack } from "../../../shared/domain/dev/repo-pack.ts";
import type { PermissionRule } from "../../../shared/domain/agent-policy/permission.ts";
import { ruleDecision } from "../../../shared/domain/agent-policy/permission.ts";
import {
  DEV_PR_AUTO_CONFIG_KEY, GIT_CURRENT_BRANCH_COMMAND, gitPushCommand, shellQuote,
} from "../../../shared/domain/git/close.ts";
import type { PrSummary } from "../../../shared/domain/git/close.ts";

export interface MergedBatch { batch: string; hash: string }

export interface PlanCloseInput {
  code: string;
  dev: DevCode;
  pack: RepoPack | null;
  work: WorkFolder;
  /** The batches' commits, in the log's order. */
  merged: readonly MergedBatch[];
  /** --pr: open the pull request rather than hand it over. */
  pr: boolean;
  /** The session's rules read at the launch: a deny on the push keeps the commits local. */
  rules: readonly PermissionRule[];
}

export interface PlanClose { closed: boolean; lines: string[] }

const LAYERS = ["domain", "application", "infrastructure", "tests"] as const;
const MAX_FILES_PER_COMMIT = 200;

const under = (path: string, root: string): boolean => {
  const r = root.replace(/\/+$/, "");
  return path === r || path.startsWith(`${r}/`);
};

/** The paths grouped by the pack's layout roots, the others last. */
export function filesPerLayer(pack: RepoPack | null, paths: readonly string[]): PrSummary["layers"] {
  const left = new Set(paths);
  const out: PrSummary["layers"] = [];
  for (const layer of LAYERS) {
    const root = pack?.layout[layer];
    if (!root) continue;
    const mine = [...left].filter((p) => under(p, root)).sort();
    mine.forEach((p) => left.delete(p));
    out.push({ layer, paths: mine });
  }
  out.push({ layer: "other", paths: [...left].sort() });
  return out;
}

/** The files of the batches' commits; a commit git cannot show adds none. */
async function filesOf(shell: Pick<Shell, "run">, merged: readonly MergedBatch[]): Promise<string[]> {
  const out = new Set<string>();
  for (const m of merged) {
    if (!/^[0-9a-f]{4,40}$/i.test(m.hash)) continue;
    const r = await runGit(shell, `git show --name-only --format= ${shellQuote(m.hash)}`);
    if (r.exitCode !== 0) continue;
    for (const p of r.stdout.split("\n").map((l) => l.trim()).filter((l) => l !== "").slice(0, MAX_FILES_PER_COMMIT)) out.add(p);
  }
  return [...out];
}

async function prAuto(config: Pick<ConfigStore, "readValue">): Promise<boolean> {
  try {
    return (await config.readValue(DEV_PR_AUTO_CONFIG_KEY)).value?.trim() === "true";
  } catch {
    return false;
  }
}

/** The pull request's summary for the whole plan. */
export function planSummary(input: PlanCloseInput, files: readonly string[]): PrSummary {
  const { dev } = input;
  const plan = dev.plan;
  const feature = plan?.plan.feature ?? input.code;
  const ids = input.merged.map((m) => m.batch);
  const validations: string[] = [];
  const audits: string[] = [];
  const notRun: string[] = [];
  for (const batch of ids) {
    const verdicts = dev.verdicts.filter((v) => v.batch === batch);
    const verdict = verdicts.length === 0 ? null : lastVerdict(verdicts[verdicts.length - 1].file);
    if (verdict === null) continue;
    validations.push(...verdict.validations.map((v) => `${batch}: ${v}`));
    audits.push(`${batch} ${verdict.verdict ?? "?"}${verdict.when ? ` (${verdict.when})` : ""}, \`${dev.shown}/${verdicts[verdicts.length - 1].name}\``);
    notRun.push(...verdict.notRun.map((v) => `${batch}: ${v}`));
  }
  return {
    batch: `${plan?.plan.prefix ?? input.code.toUpperCase()} — ${feature}: batches ${ids.join(", ") || "none"}, ` +
      `from \`${dev.shown}/${plan?.name ?? "?"}\`, one commit each (${input.merged.map((m) => `${m.batch} ${m.hash}`).join(", ")}).`,
    layers: filesPerLayer(input.pack, files),
    validations,
    audit: audits.join("; "),
    notRun: notRun.join("; "),
  };
}

export async function closePlan(
  deps: { files: Pick<Files, "write">; shell: Pick<Shell, "run">; config: Pick<ConfigStore, "readValue">; opener?: PullRequestOpener },
  input: PlanCloseInput,
): Promise<PlanClose> {
  const current = await runGit(deps.shell, GIT_CURRENT_BRANCH_COMMAND);
  const branch = current.exitCode === 0 ? current.stdout.trim() : "";
  if (branch === "") {
    return { closed: false, lines: [`✗ close: no current branch (a detached HEAD?): check out the work branch, then /dev-batches ${input.code}`] };
  }
  const base = await defaultBranch(deps.shell);
  if (base !== null && base === branch) {
    return {
      closed: true,
      lines: [`✓ every batch is committed on ${branch}, the default branch: no pull request; pushing it is yours (${gitPushCommand(branch)})`],
    };
  }
  const lines: string[] = [];
  const pushCommand = gitPushCommand(branch);
  let pushed = false;
  let closed = true;
  if (ruleDecision(input.rules, "shell_command", { command: pushCommand, working_directory: "/workspace" }) === "deny") {
    lines.push(`✗ not pushed: a session rule denies '${pushCommand}'; the commits stay local`);
  } else {
    const push = await pushBranch(deps.shell, branch);
    pushed = push.ok;
    closed = push.ok;
    lines.push(push.ok ? `✓ pushed ${branch} to origin` : `✗ ${push.line}`);
  }
  const files = await filesOf(deps.shell, input.merged);
  const summary = planSummary(input, files);
  const feature = input.dev.plan?.plan.feature ?? input.code;
  lines.push(...await handOverPullRequest(
    { files: deps.files, opener: deps.opener },
    {
      work: { folder: input.work.folder, vfsPath: input.work.vfsPath }, branch, base, title: `feat(${input.code}): ${feature}`,
      pushed, open: input.pr || (await prAuto(deps.config)), summary,
    },
  ));
  if (!closed) lines.push(`the run stays open: /dev-batches ${input.code} tries the push again`);
  return { closed, lines };
}
