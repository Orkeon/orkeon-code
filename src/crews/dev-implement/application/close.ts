// The close of a batch the audit found VALID (`/dev-implement F<n> <code> --close`, or the chain
// after /dev-verify): the last verdict of `<CODE>-VERIFY-F<n>.md` must be VALID, then the files the
// roles changed (touched.ts) are committed by name, pushed, and the pull request opened or handed
// over (shared/application/dev/close-batch.ts). Nothing is committed without that verdict. On the default
// branch, when the pack asks for a work branch, the close creates `<prefix>/<code>-f<n>` first. Once
// committed, the batch is marked done: the sheet's title and the global plan's batch (never committed,
// the work folder stays out of git).
import type { Files, Shell } from "../../../shared/application/ports.ts";
import type { ConfigStore } from "../../../shared/application/config-store.ts";
import type { PullRequestOpener } from "../../../shared/application/git/commit-files.ts";
import { runGit } from "../../../shared/application/git/commit-files.ts";
import { closeBatch } from "../../../shared/application/dev/close-batch.ts";
import type { WorkFolder } from "../../../shared/application/dev/resolve-work-folder.ts";
import { lastVerdict, parseVerdictFile } from "../../../shared/domain/dev/verdict-format.ts";
import { parseBatchSheet } from "../../../shared/domain/dev/plan-format.ts";
import type { RepoPack } from "../../../shared/domain/dev/repo-pack.ts";
import { DEV_PR_AUTO_CONFIG_KEY, GIT_CURRENT_BRANCH_COMMAND, GIT_DEFAULT_BRANCH_COMMAND, parseDefaultBranch } from "../../../shared/domain/git/close.ts";
import type { PrSummary } from "../../../shared/domain/git/close.ts";
import type { PermissionRule } from "../../../shared/domain/agent-policy/permission.ts";
import { under } from "../domain/step-checks.ts";
import { openSteps, parseImplementSheet } from "../domain/step-section.ts";
import { markPlanBatchDone, markSheetDone } from "../domain/sheet-edits.ts";
import { shellQuote, workBranchFromPattern } from "../../../shared/domain/git/close.ts";
import { WORKSPACE } from "./locate-sheet.ts";
import { verdictMarkOf } from "./touched.ts";
import type { LocatedSheet } from "./locate-sheet.ts";

export interface CloseInput {
  pack: RepoPack;
  work: WorkFolder;
  located: LocatedSheet;
  batch: string;
  touched: string[];
  /** The verdict file's mark when the touched list was last written (touched.ts). */
  verdictMark: string | null;
  openPr: boolean;
  push: boolean;
  /** The session's rules at the launch (a deny on the push keeps the commit local). */
  rules?: readonly PermissionRule[];
  /** Today, `YYYY-MM-DD`: the date of the done marks. */
  today: string;
}

const LAYERS = ["domain", "application", "infrastructure", "tests"] as const;

/** The touched paths grouped by the pack's layout roots, the others last. */
export function layersOf(pack: RepoPack, touched: readonly string[]): PrSummary["layers"] {
  const left = new Set(touched);
  const out: PrSummary["layers"] = [];
  for (const layer of LAYERS) {
    const root = pack.layout[layer];
    if (!root) continue;
    const paths = [...left].filter((p) => under(p, root)).sort();
    paths.forEach((p) => left.delete(p));
    out.push({ layer, paths });
  }
  out.push({ layer: "other", paths: [...left].sort() });
  return out;
}

async function prAuto(config: Pick<ConfigStore, "readValue">): Promise<boolean> {
  try {
    return (await config.readValue(DEV_PR_AUTO_CONFIG_KEY)).value?.trim() === "true";
  } catch {
    return false;
  }
}

export async function closeDevBatch(
  deps: { files: Files; shell: Shell; config: Pick<ConfigStore, "readValue">; opener?: PullRequestOpener },
  input: CloseInput,
): Promise<string[]> {
  const { located, batch } = input;
  const rerun = `/dev-implement ${batch} ${located.code} --close`;
  const verdictName = `${located.prefix}-VERIFY-${batch}.md`;
  let verdictText: string;
  try {
    verdictText = await deps.files.read(`${WORKSPACE}/${located.dir}/${verdictName}`);
  } catch {
    return [`BLOCKED — close: no ${located.dir}/${verdictName}: the batch is audited first (/dev-verify ${batch} ${located.code})`];
  }
  const verdict = lastVerdict(parseVerdictFile(verdictText));
  if (verdict?.verdict !== "VALID") {
    return [`BLOCKED — close: the last verdict of ${verdictName} is ${verdict?.verdict ?? "missing"}, not VALID: nothing is committed`];
  }
  if (input.touched.length === 0) {
    return [`BLOCKED — close: no file recorded for ${batch} (.orkeon/dev/${located.code}/implement-${batch}.json): commit the batch with /commit <files>`];
  }
  if (input.verdictMark === null || input.verdictMark === verdictMarkOf(verdictText)) {
    return [`BLOCKED — close: ${verdictName} was not written since the last /dev-implement ${batch} run changed the batch: audit it again (/dev-verify ${batch} ${located.code})`];
  }
  let sheetText: string;
  try {
    sheetText = await deps.files.read(`${WORKSPACE}/${located.dir}/${located.name}`);
  } catch {
    return [`BLOCKED — close: ${located.dir}/${located.name} cannot be read: nothing is committed`];
  }
  const open = openSteps(parseImplementSheet(sheetText)).map((s) => s.number);
  if (open.length > 0) {
    return [`BLOCKED — close: step ${open.join(", ")} of ${located.name} still has a TDD box open: /dev-implement ${batch} ${located.code} first`];
  }

  const current = await runGit(deps.shell, GIT_CURRENT_BRANCH_COMMAND);
  const branch = current.exitCode === 0 ? current.stdout.trim() : "";
  if (branch === "") return ["BLOCKED — close: no current branch (a detached HEAD?): check out the work branch, then " + rerun];
  const base = await runGit(deps.shell, GIT_DEFAULT_BRANCH_COMMAND);
  const defaultBranch = base.exitCode === 0 ? parseDefaultBranch(base.stdout) : null;
  const wanted = input.pack.contrib.branch?.trim();
  let onBranch = branch;
  const notes: string[] = [];
  if (wanted && defaultBranch !== null && branch === defaultBranch) {
    const made = await createWorkBranch(deps.shell, wanted, located.code, batch);
    if (!made.ok) return [`BLOCKED — close: ${branch} is the default branch and the pack asks for a work branch (${wanted}): ${made.reason}, then ${rerun}`];
    onBranch = made.branch;
    notes.push(`✓ branch ${made.branch} created from ${branch} (contrib.branch ${wanted})`);
  }

  const sheetName = parseBatchSheet(sheetText).name ?? located.name;
  const message = `feat(${located.code}): ${sheetName} (batch ${batch})`;
  const summary: PrSummary = {
    batch: `${located.prefix} ${batch} — ${sheetName}, from \`${located.dir}/${located.name}\`.`,
    layers: layersOf(input.pack, input.touched),
    validations: verdict.validations,
    audit: `VALID${verdict.when ? ` (${verdict.when})` : ""}, \`${located.dir}/${verdictName}\`.`,
    notRun: verdict.notRun.join("; "),
  };
  const result = await closeBatch(
    { shell: deps.shell, files: deps.files, opener: deps.opener },
    {
      touched: input.touched, message, branch: onBranch, work: { folder: input.work.folder, vfsPath: input.work.vfsPath },
      push: input.push, ...(input.rules === undefined ? {} : { rules: input.rules }), openPr: input.openPr || (await prAuto(deps.config)), summary, rerun,
    },
  );
  if (!result.committed) return [...notes, ...result.lines];
  return [...notes, ...result.lines, ...await markDone(deps.files, located, batch, sheetText, input.today)];
}

/** The work branch's name from the pack's pattern: its first alternative before `/`, then `<code>-f<n>`. */
export function workBranchName(pattern: string, code: string, batch: string): string | null {
  return workBranchFromPattern(pattern, `${code}-${batch.toLowerCase()}`);
}

async function createWorkBranch(
  shell: Pick<Shell, "run">, pattern: string, code: string, batch: string,
): Promise<{ ok: true; branch: string } | { ok: false; reason: string }> {
  const name = workBranchName(pattern, code, batch);
  if (name === null) return { ok: false, reason: `no branch name can be made from '${pattern}' (<prefix>/<slug>): create it` };
  const exists = await runGit(shell, `git rev-parse --verify --quiet ${shellQuote(`refs/heads/${name}`)}`);
  if (exists.exitCode === 0) return { ok: false, reason: `the branch ${name} exists already: switch to it (git switch ${name})` };
  const made = await runGit(shell, `git switch -c ${shellQuote(name)}`);
  if (made.exitCode !== 0) {
    return { ok: false, reason: `git switch -c ${name} failed (${(made.stderr || made.stdout).trim().split("\n")[0] || `exit ${made.exitCode}`}): create it` };
  }
  return { ok: true, branch: name };
}

/** The sheet's title and the global plan's batch marked done; a file that cannot be written is said. */
async function markDone(files: Files, located: LocatedSheet, batch: string, sheetText: string, today: string): Promise<string[]> {
  const out: string[] = [];
  const sheetPath = `${WORKSPACE}/${located.dir}/${located.name}`;
  const planName = `${located.prefix}-PLAN.md`;
  try {
    const now = await files.read(sheetPath).catch(() => sheetText);
    const marked = markSheetDone(now, today);
    if (marked !== now) await files.write(sheetPath, marked);
    out.push(`✓ ${located.name} marked done (${today})`);
  } catch (e) {
    out.push(`⚠ ${located.name} could not be marked done: ${String((e as Error)?.message ?? e).split("\n")[0]}`);
  }
  try {
    const plan = await files.read(`${WORKSPACE}/${located.dir}/${planName}`);
    const marked = markPlanBatchDone(plan, batch, today);
    if (marked !== plan) {
      await files.write(`${WORKSPACE}/${located.dir}/${planName}`, marked);
      out.push(`✓ ${planName}: batch ${batch} marked done`);
    }
  } catch {
    out.push(`⚠ ${planName} not found beside the sheet: its batch ${batch} is not marked done`);
  }
  return out;
}
