// /diff — the typed `--staged` flag the baseline specifies, and the allowlist
// of options and pathspecs that reach `git diff` (B-11 deepening); runDiff runs
// it over the Shell port. Lives under commands/_lib/ — the loader's SearchPattern
// is "*.cmd.ts", so this file is never loaded as a command.

import type { Logger, Shell } from "../../../shared/application/ports.ts";
import type { CommandView } from "../view.ts";

export interface DiffPlan {
  /** The git argument string, already assembled. */
  args: string;
  staged: boolean;
  /** Tokens that were dropped, with the reason — never silently ignored. */
  rejected: Array<{ value: string; reason: string }>;
}

/**
 * Only these git-diff options are honoured.
 *
 * The pre-B-11 handler appended `raw` verbatim: `git diff <anything the operator
 * typed>`. The shell tool forbids operators, so this was not an injection hole,
 * but it was an unbounded surface — `--output=/etc/x` is a plain git option that
 * writes a file, and no allowlist stood in the way. The baseline specifies exactly
 * one flag (`staged`); the extra safe options below are the ones a diff reader
 * actually reaches for, and anything else is refused BY NAME so the operator knows.
 */
export const ALLOWED_DIFF_FLAGS = [
  "--staged", "--cached", "--stat", "--name-only", "--name-status",
  "--numstat", "--shortstat", "-p", "--unified", "--word-diff",
];

/** A pathspec: no leading dash, no shell metacharacter, no parent traversal. */
const SAFE_PATHSPEC = /^[A-Za-z0-9._/\-*]+$/;

export function planDiff(tokens: readonly string[]): DiffPlan {
  const rejected: Array<{ value: string; reason: string }> = [];
  const flags: string[] = [];
  const paths: string[] = [];

  for (const raw of tokens ?? []) {
    const token = String(raw ?? "").trim();
    if (token.length === 0) continue;

    if (token.startsWith("-")) {
      // `--unified=3` and `-U3` carry a value; compare on the option part.
      const head = token.split("=")[0];
      if (ALLOWED_DIFF_FLAGS.includes(head)) flags.push(token);
      else rejected.push({ value: token, reason: `not an allowed diff option (allowed: ${ALLOWED_DIFF_FLAGS.join(" ")})` });
      continue;
    }

    if (!SAFE_PATHSPEC.test(token) || token.includes("..")) {
      rejected.push({ value: token, reason: "not a plausible pathspec (letters, digits, '.', '_', '/', '-', '*'; no '..')" });
      continue;
    }
    paths.push(token);
  }

  const staged = flags.some((f) => f === "--staged" || f === "--cached");
  // `--` separates options from pathspecs, so a path that looks like a ref stays a path.
  const args = [...flags, ...(paths.length > 0 ? ["--", ...paths] : [])].join(" ");
  return { args, staged, rejected };
}

/** Baseline wording for an empty diff — a distinct sentence, not "(no output)". */
export const NO_CHANGES_MESSAGE = "No changes to show.";

export function describeDiffScope(plan: DiffPlan): string {
  return plan.staged ? "staged changes" : "working-tree changes since the last commit";
}

export interface DiffDeps {
  shell: Shell;
  log: Pick<Logger, "warn">;
}

/** `/diff [--staged] [pathspec…]`, from the command's raw tokens: the diff as lines,
 *  each ignored token logged and counted in the closing message. */
export async function runDiff(tokens: readonly string[], deps: DiffDeps): Promise<CommandView> {
  const plan = planDiff(tokens);
  for (const r of plan.rejected) deps.log.warn(`/diff ignored '${r.value}' — ${r.reason}`);

  const r = await deps.shell.run(`git diff ${plan.args}`.trim());
  if (r.exitCode !== 0) {
    const err = r.stderr.trim();
    return { text: `git diff failed: ${err || `exit code ${r.exitCode}`}` };
  }

  const out = r.stdout;
  if (out.trim().length === 0) {
    return { text: `${NO_CHANGES_MESSAGE} (${describeDiffScope(plan)})` };
  }
  return {
    lines: [`── ${describeDiffScope(plan)}`, out],
    ...(plan.rejected.length > 0 ? { text: `${plan.rejected.length} argument(s) ignored — see the log.` } : {}),
  };
}
