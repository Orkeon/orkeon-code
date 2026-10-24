// The pull request Orkeon Code opens itself with the runtime's `github` tool
// (W0-C, Q-10): where origin lives on GitHub, and whether the call may run. Pure,
// no IO. A command's or a crew's own tool call is not seen by the host gate
// (docs/permissions.md, "What the gate does not see"), so the decision mirrors
// the gate here (ModePermissionGate): `github` is an edit (permission.ts) the
// gate asks about in `default` and `acceptEdits`, runs in `bypassPermissions`
// and refuses in `plan` and `dontAsk`; a deny rule wins in every mode, an allow
// rule spares the question in every mode but `plan`. One point is stricter than
// the gate: an unknown mode refuses (the gate reads it as `default`).

import { parseStoredRule, ruleDecision } from "../agent-policy/permission.ts";
import type { PermissionRule } from "../agent-policy/permission.ts";
import { isPermissionMode } from "../permission-modes.ts";

/** The tool, and the action of its call. */
export const GITHUB_TOOL = "github";
export const GITHUB_CREATE_PR = "create_pr";

/** The rule that lets /commit and the dev close open the pull request without a question. */
export const GITHUB_ALLOW_RULE = "allow github action=create_pr";

/** origin's URL, as the user configured it. */
export const GIT_REMOTE_URL_COMMAND = "git remote get-url origin";

export interface GitHubRepo { owner: string; repo: string }

/**
 * The repository of a github.com remote: `https://github.com/<owner>/<repo>(.git)`
 * (a user name before the host allowed), `git@github.com:<owner>/<repo>(.git)` and
 * `ssh://git@github.com/<owner>/<repo>(.git)`. Null for any other host, a GitHub
 * Enterprise one included: the tool talks to api.github.com alone.
 */
export function parseGitHubRemote(url: string): GitHubRepo | null {
  const u = String(url ?? "").trim();
  const m = /^(?:https?:\/\/(?:[^@/]+@)?github\.com\/|ssh:\/\/git@github\.com(?::\d+)?\/|git@github\.com:)([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/i.exec(u);
  return m === null ? null : { owner: m[1], repo: m[2] };
}

/** The input of the `create_pr` call, as the tool declares it (tools.generated.d.ts `github`). */
export type CreatePrArgs = {
  action: typeof GITHUB_CREATE_PR;
  owner: string;
  repo: string;
  base: string;
  head: string;
  title: string;
  body: string;
};

export type PrPermission = { ok: true } | { ok: false; reason: string };

/**
 * Whether the `create_pr` call may run, as the host gate would decide it. `asked`:
 * the user confirmed a plan that named the pull request (the question the gate
 * would have asked in `default` and `acceptEdits`); a crew that cannot ask passes
 * false. An unknown mode refuses, as the gate classifies one fail-closed.
 */
export function pullRequestPermission(req: {
  mode: string;
  rules: readonly PermissionRule[];
  asked: boolean;
  args: Readonly<Record<string, unknown>>;
}): PrPermission {
  if (!isPermissionMode(req.mode) || req.mode === "plan") {
    return { ok: false, reason: `mode '${req.mode}' does not run ${GITHUB_TOOL}` };
  }
  const rule = ruleDecision(req.rules, GITHUB_TOOL, req.args);
  if (rule === "deny") return { ok: false, reason: `a deny rule of /permissions covers ${GITHUB_TOOL} ${GITHUB_CREATE_PR}` };
  if (rule === "allow") return { ok: true };
  if (req.mode === "dontAsk") return { ok: false, reason: `mode 'dontAsk' runs ${GITHUB_TOOL} only under an allow rule` };
  if (req.mode === "bypassPermissions" || req.asked) return { ok: true };
  return {
    ok: false,
    reason: `${GITHUB_TOOL} asks first in mode '${req.mode}' and this run did not ask: ` +
      `'/permissions add ${GITHUB_ALLOW_RULE}' lets it open the pull request`,
  };
}

/** The session's rules as a crew receives them (an array, or one per line), read as the gate reads
 *  them; a line that is no rule is left out. */
export function parseSessionRules(raw: unknown): PermissionRule[] {
  const lines = Array.isArray(raw) ? raw : String(raw ?? "").split("\n");
  return lines.map((line) => parseStoredRule(String(line ?? "").trim())).filter((r): r is PermissionRule => r !== null);
}

/**
 * What /commit hands its crew for the pull request: `prAsked` only when `--pr` was confirmed
 * at the prompt (`--yes` asked nothing); the tool and the rules, read when the run may reach the
 * pull request (`--push` or `--pr`). The rules are those of the launch: one added while the crew
 * runs is not seen, where the gate reads them at each call.
 */
export function pullRequestCrewInputs(req: {
  pr: boolean; push: boolean; yes: boolean; read: () => { githubTool: boolean; permissionRules: string[] };
}): { prAsked: boolean; githubTool?: boolean; permissionRules?: string[] } {
  return { prAsked: req.pr && !req.yes, ...(req.pr || req.push ? req.read() : {}) };
}
