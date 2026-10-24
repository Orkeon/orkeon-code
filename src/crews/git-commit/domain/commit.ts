// Pure commit helpers — no IO: the message cleanup, what the status says the commit
// will hold, the paths that must stop a commit, and the guards of the destructive step.

import { unwrapFences } from "../../../shared/domain/strip.ts";
import { policyFor } from "../../../shared/domain/agent-policy/mode-policy.ts";

const FALLBACK = "chore: update working tree";

/** Clean an LLM-drafted commit message: unwrap fences, trim, fall back if empty. */
export function normalizeCommitMessage(raw: string): string {
  const msg = unwrapFences(String(raw ?? "")).trim();
  return msg.length === 0 ? FALLBACK : msg;
}

/** How the drafting model refuses: a reply starting with it is no message. */
export const COMMIT_REFUSAL_PREFIX = "REFUSE:";

/** The reason a drafted reply refuses to commit, or null when it is a message. */
export function commitRefusal(message: string): string | null {
  const text = String(message ?? "").trim();
  return text.startsWith(COMMIT_REFUSAL_PREFIX) ? text.slice(COMMIT_REFUSAL_PREFIX.length).trim() || "no reason given" : null;
}

/** The paths a `git status --short` lists (the new path of a rename), quotes removed. */
export function statusPaths(status: string): string[] {
  return String(status ?? "")
    .split("\n")
    .filter((line) => line.length > 3)
    .map((line) => {
      const rest = line.slice(3);
      const arrow = rest.indexOf(" -> ");
      const path = arrow >= 0 ? rest.slice(arrow + 4) : rest;
      return path.trim().replace(/^"(.*)"$/, "$1");
    })
    .filter((path) => path.length > 0);
}

/** The untracked files of a `git status --short` (`??` lines). */
export function untrackedPaths(status: string): string[] {
  return String(status ?? "").split("\n").filter((line) => line.startsWith("?? ")).flatMap((line) => statusPaths(line));
}

/** Moved to the shared domain, so the shared memory can reuse it; re-exported for this crew. */
export { secretLikePaths } from "../../../shared/domain/secret-patterns.ts";

/** The subject line (first line) of a commit message. */
export function commitSubject(message: string): string {
  return message.split("\n")[0];
}

// Conventional-Commits subject: `type(scope)!: subject`. Informational — the
// crew never rejects on it, but it lets a test assert the prompt discipline.
const CONVENTIONAL = /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([^)]+\))?!?:\s.+/;
export function isConventionalCommit(message: string): boolean {
  return CONVENTIONAL.test(commitSubject(message).trim());
}

// ── The destructive step is a decision, not a side effect ───────────────
//
// `/commit` used to stage and commit the entire working tree with no gate
// consultation whatsoever (round-40 finding `commit-no-confirmation`): the
// framework's IPermissionGate only fires inside the `act` tool-calling loop, and
// this crew commits from its body. The original gates every destructive action
// through its decision table (baseline 08 §Decision table) and its GitCommit
// crew is specified to "commit safely" (baseline 03).
//
// Two independent guards, both pure and both testable, because either one alone
// has a hole: a mode check alone still commits when someone forgets to thread the
// mode, and a confirmation alone is bypassed by a non-interactive session.

export interface CommitPermission {
  allowed: boolean;
  /** Why, in terms an operator can act on. Empty when allowed. */
  reason: string;
}

/**
 * Whether a commit may proceed under `mode`.
 *
 * An absent mode is REFUSED, not allowed: this runs on the path that rewrites the
 * user's repository, and "the mode never reached me" is exactly the threading bug
 * the round found. Fail-closed on absence differs deliberately from `toolsetFor`,
 * which is a catalogue and degrades to the permissive default. A present mode is
 * refused only when its policy is read-only; an unknown one is allowed — which
 * modes exist is a catalogue question, and /mode validated the name upstream.
 */
export function isCommitPermitted(mode: unknown): CommitPermission {
  const m = typeof mode === "string" ? mode.trim() : "";
  if (m.length === 0) {
    return {
      allowed: false,
      reason:
        "no permission mode reached the git-commit crew — refusing to stage and commit. " +
        "The command must thread `permissionMode` in its crew inputs.",
    };
  }
  // The read-only modes (mode-policy.ts) must never reach a commit.
  if (policyFor(m).readOnly) {
    return {
      allowed: false,
      reason:
        `permission mode '${m}' is read-only — no staging, no commit. ` +
        "Switch with /mode acceptEdits (or bypassPermissions) and re-run /commit.",
    };
  }
  return { allowed: true, reason: "" };
}

/** What `/commit` is about to do, rendered for a confirmation prompt. */
export interface CommitPlan {
  /** The shell mutations, in order, exactly as they will run. */
  steps: string[];
  /** One-line summary for the confirm prompt. */
  question: string;
  /** The multi-line notice printed before asking. */
  notice: string;
}

/**
 * Builds the confirmation plan.
 *
 * It says which files the commit holds — every change the status lists,
 * untracked files included, or only the paths named — and what stays out (the
 * work folder), because "commit the current changes" reads as "commit what I was
 * working on": the gap between the two readings is the reason this gate exists.
 *
 * The drafted subject is NOT here: it comes from an LLM call inside the crew, so
 * showing it first would mean either drafting twice or launching the crew before
 * the confirmation — and the confirmation must precede the launch. The subject is
 * reported on the completion line instead.
 */
export function buildCommitPlan(
  opts: { branch?: string; push?: boolean; pr?: boolean; paths?: readonly string[] } = {},
): CommitPlan {
  const branch = (opts.branch ?? "").trim();
  const where = branch.length > 0 ? ` on '${branch}'` : "";
  const paths = opts.paths ?? [];
  const what = paths.length > 0
    ? `the changes under ${paths.join(", ")}`
    : "EVERY change the status lists (untracked files included), the work folder left out";
  const steps = ["git add -- <files>", "git commit -F <drafted message> -- <files>"];
  const push = opts.push === true || opts.pr === true;
  if (push) steps.push("git push -u origin <branch>");
  // Answering yes to this plan is the question the host gate would ask before the github call (W0-C).
  if (opts.pr === true) steps.push("github create_pr");
  return {
    steps,
    question: `Commit ${paths.length > 0 ? "the changes under the paths named" : "EVERY change"}${where}${push ? " and push" : ""}${opts.pr === true ? ", then open the pull request" : ""}?`,
    notice: [
      `/commit will, ${branch.length > 0 ? `on branch '${branch}'` : "on the current branch"}:`,
      "  1. check that git has an identity (git var), and stop if it has none",
      `  2. git add -- <files>    — ${what}`,
      "  3. draft a Conventional-Commits message with the LLM",
      "  4. git commit -F <that message> -- <files>   (changes staged elsewhere stay out)",
      ...(opts.pr === true
        ? ["  5. git push -u origin <branch>, then open the pull request with the github tool",
          "     (or print the gh pr create command when it cannot)"]
        : push ? ["  5. git push -u origin <branch>, then print the pull request command"] : []),
      "A file that usually holds a secret (.env, a private key) stops it before step 2.",
      "The message is drafted after this confirmation; it is echoed when the commit lands.",
    ].join("\n"),
  };
}

export interface CommitArgs { yes: boolean; push: boolean; pr: boolean; paths: string[] }

/**
 * `/commit [--yes|-y] [--push] [--pr] [<path>...]`. `--pr` asks for the pull
 * request (Q-10) and so implies the push. An unknown flag is refused rather than
 * read as a path.
 */
export function parseCommitArgs(tokens: readonly unknown[]): { ok: true; args: CommitArgs } | { ok: false; text: string } {
  const args: CommitArgs = { yes: false, push: false, pr: false, paths: [] };
  let options = true;
  for (const raw of tokens ?? []) {
    const t = String(raw ?? "").trim();
    if (t.length === 0) continue;
    // `--` ends the options: what follows is a path, even one that starts with `-`.
    if (options && t === "--") { options = false; continue; }
    if (!options) { args.paths.push(t); continue; }
    const flag = t.toLowerCase();
    if (flag === "--yes" || flag === "-y") args.yes = true;
    else if (flag === "--push") args.push = true;
    else if (flag === "--pr") { args.pr = true; args.push = true; }
    else if (t.startsWith("-")) return { ok: false, text: `✗ unknown option '${t}'. Usage: /commit [--yes] [--push] [--pr] [<path>...]` };
    else args.paths.push(t);
  }
  return { ok: true, args };
}
