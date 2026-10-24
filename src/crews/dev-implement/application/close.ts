// The close of a batch the audit found VALID (`/dev-implement F<n> <code> --close`, or the chain
// after /dev-verify): the last verdict of `<CODE>-VERIFY-F<n>.md` must be VALID, then the files the
// roles changed (touched.ts) are committed by name, pushed, and the pull request opened or handed
// over (shared/application/dev/close-batch.ts). Nothing is committed without that verdict.
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
import { under } from "../domain/step-checks.ts";
import { openSteps, parseImplementSheet } from "../domain/step-section.ts";
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
  if (wanted && defaultBranch !== null && branch === defaultBranch) {
    return [`BLOCKED — close: ${branch} is the default branch and the pack asks for a work branch (${wanted}): create it, then ${rerun}`];
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
      touched: input.touched, message, branch, work: { folder: input.work.folder, vfsPath: input.work.vfsPath },
      push: input.push, openPr: input.openPr || (await prAuto(deps.config)), summary, rerun,
    },
  );
  return result.lines;
}
