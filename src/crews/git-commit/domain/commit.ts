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

/** File names that usually hold a secret, and the safe variants of them. */
const SECRET_EXTENSIONS = [".pem", ".key", ".p12", ".pfx", ".jks", ".keystore"];
const SECRET_KEY_FILES = /^id_(rsa|dsa|ecdsa|ed25519)(\.|$)/;
const SAFE_ENV_SUFFIXES = [".example", ".sample", ".template", ".dist"];

/**
 * The paths that usually hold a secret: an env file (but not its example), a key
 * or certificate store, an SSH private key, a credentials file. Committing one by
 * accident is the one mistake `git add -A` makes easy and history keeps forever,
 * so /commit stops before any model call and lets the user decide.
 */
export function secretLikePaths(paths: readonly string[]): string[] {
  return paths.filter((path) => {
    const name = path.split("/").pop() ?? "";
    const lower = name.toLowerCase();
    if (lower === ".env" || (lower.startsWith(".env.") && !SAFE_ENV_SUFFIXES.some((s) => lower.endsWith(s)))) return true;
    if (SECRET_EXTENSIONS.some((ext) => lower.endsWith(ext))) return true;
    if (SECRET_KEY_FILES.test(lower) && !lower.endsWith(".pub")) return true;
    return lower === "credentials" || lower === "credentials.json";
  });
}

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
 * It names `git add -A` explicitly and says what that INCLUDES, because "commit
 * the current changes" reads as "commit what I was working on" while the command
 * stages every untracked file in the tree — the gap between those two readings is
 * the whole reason this gate exists.
 *
 * The drafted subject is NOT here: it comes from an LLM call inside the crew, so
 * showing it first would mean either drafting twice or launching the crew before
 * the confirmation — and the confirmation must precede the launch. The subject is
 * reported on the completion line instead.
 */
export function buildCommitPlan(branch?: string): CommitPlan {
  const where = branch && branch.trim().length > 0 ? ` on '${branch.trim()}'` : "";
  return {
    steps: ["git add -A", "git commit -F <drafted message>"],
    question: `Stage EVERY change${where} and commit?`,
    notice: [
      `/commit will, ${where ? `on branch '${branch!.trim()}'` : "on the current branch"}:`,
      "  1. git add -A            — stages every modification AND every untracked file",
      "  2. draft a Conventional-Commits message with the LLM",
      "  3. git commit -F <that message>",
      "A file that usually holds a secret (.env, a private key) stops it before step 1.",
      "The message is drafted after this confirmation; it is echoed when the commit lands.",
    ].join("\n"),
  };
}

/** `--yes` / `-y`: the explicit confirm argument that skips the prompt. */
export function hasExplicitConfirm(tokens: readonly unknown[]): boolean {
  return (tokens ?? []).some((t) => {
    const s = String(t ?? "").trim().toLowerCase();
    return s === "--yes" || s === "-y";
  });
}
