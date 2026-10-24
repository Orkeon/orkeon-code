// The preflight of a /dev-batches run, before it launches a batch: one line per check. The plan read
// without format problems, a sheet for every batch not done, an order the dependencies allow, git's
// identity (each batch's close commits) and a current branch. A ✗ stops the run before any launch; a
// tree changed outside the work folder and `.orkeon/` is a ⚠ only (a close commits the files its batch
// touched, by name). The plan's facts come read; git is asked here.
import type { Shell } from "../ports.ts";
import { readIdentity, runGit } from "../git/commit-files.ts";
import { GIT_CURRENT_BRANCH_COMMAND, GIT_STATUS_COMMAND, changedPaths } from "../../domain/git/close.ts";

export interface PreflightInput {
  /** The plan as the user reads it, `workbench/demo/DEMO-PLAN.md`; null when the code has none. */
  planShown: string | null;
  /** The format problems read in the plan and its sheets. */
  problems: readonly string[];
  batches: number;
  /** The batches not done that have no sheet. */
  missingSheets: readonly string[];
  /** The order the dependencies allow, or why there is none. */
  order: { ok: true; order: readonly string[] } | { ok: false; problem: string };
  /** The work folder, relative to the checkout: its changes are the workflow's own. */
  workFolder: string;
}

export interface PreflightResult { ok: boolean; lines: string[] }

const MAX_LISTED = 5;

function listed(items: readonly string[]): string {
  return items.length <= MAX_LISTED ? items.join(", ") : `${items.slice(0, MAX_LISTED).join(", ")} and ${items.length - MAX_LISTED} more`;
}

export async function preflight(deps: { shell: Pick<Shell, "run"> }, input: PreflightInput): Promise<PreflightResult> {
  const lines: string[] = [];
  let ok = true;
  const fail = (line: string): void => { ok = false; lines.push(`preflight ✗ ${line}`); };

  if (input.planShown === null) fail("plan: none in the code's folder: /dev-plan first");
  else if (input.problems.length > 0) fail(`plan: ${input.problems.length} format problem(s): ${listed(input.problems)}`);
  else lines.push(`preflight ✓ plan: ${input.planShown} (${input.batches} batch(es))`);

  if (input.missingSheets.length > 0) fail(`sheets: no sheet for ${input.missingSheets.join(", ")}`);
  else lines.push("preflight ✓ sheets: one for every batch not done");

  if (!input.order.ok) fail(`order: ${input.order.problem}`);
  else lines.push(`preflight ✓ order: ${input.order.order.join(" → ") || "(no batch)"}`);

  const identity = await readIdentity(deps.shell);
  if (!identity.ok) fail(`git identity: ${identity.detail} (each batch's close commits): git config --global user.name and user.email`);
  else lines.push(`preflight ✓ git identity: ${identity.ident.name} <${identity.ident.email}>`);

  const branch = await runGit(deps.shell, GIT_CURRENT_BRANCH_COMMAND);
  const name = branch.exitCode === 0 ? branch.stdout.trim() : "";
  if (name === "") fail("branch: none checked out (a detached HEAD?): check out the work branch");
  else lines.push(`preflight ✓ branch: ${name}`);

  const status = await runGit(deps.shell, GIT_STATUS_COMMAND);
  if (status.exitCode === 0) {
    const work = input.workFolder.replace(/\/+$/, "");
    const own = (p: string): boolean => p === work || p.startsWith(`${work}/`) || p.startsWith(".orkeon/");
    const others = changedPaths(status.stdout).filter((p) => !own(p));
    if (others.length > 0) {
      lines.push(`preflight ⚠ tree: ${others.length} change(s) outside the work folder (${listed(others)}): a close commits only its batch's files`);
    }
  }
  return { ok, lines };
}
