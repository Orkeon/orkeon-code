// The remotes, modes and rules the pull request decisions are tested on.
import { GITHUB_ALLOW_RULE } from "../../../../src/shared/domain/git/pull-request.ts";
import { readRule } from "../../../../src/shared/domain/agent-policy/permission.ts";
import type { PermissionRule } from "../../../../src/shared/domain/agent-policy/permission.ts";

export const GITHUB_REMOTES: readonly string[] = [
  "https://github.com/Orkeon/orkeon-code.git", "https://github.com/Orkeon/orkeon-code",
  "https://token-free@github.com/Orkeon/orkeon-code.git\n", "git@github.com:Orkeon/orkeon-code.git",
  "ssh://git@github.com/Orkeon/orkeon-code.git", "ssh://git@github.com:22/Orkeon/orkeon-code", "https://github.com/Orkeon/orkeon-code/",
];

export const OTHER_REMOTES: readonly string[] = [
  "https://gitlab.com/a/b.git", "https://github.example.com/a/b", "/srv/git/b.git", "", "https://github.com/a/b/c",
];

/** The arguments of a create_pr call. */
export const ARGS = { action: "create_pr", owner: "o", repo: "r", base: "main", head: "feat/x", title: "t", body: "b" };

/** The rules read from their lines. */
export const rules = (...lines: string[]): PermissionRule[] => lines.map((l) => readRule(l)!);

export interface DecisionCase { name: string; mode: string; asked: boolean; rules: string[]; ok: boolean }

export const REFUSED_MODES: readonly DecisionCase[] = ["plan", "turbo"].map((mode) => (
  { name: mode, mode, asked: true, rules: ["allow github"], ok: false }
));

export const DONT_ASK_CASES: readonly DecisionCase[] = [
  { name: "an allow rule alone runs", mode: "dontAsk", asked: false, rules: [GITHUB_ALLOW_RULE], ok: true },
  { name: "a yes alone does not", mode: "dontAsk", asked: true, rules: [], ok: false },
];

export const ALLOWED_CASES: readonly DecisionCase[] = [
  { name: "bypassPermissions", mode: "bypassPermissions", asked: false, rules: [], ok: true },
  { name: "default with the allow rule", mode: "default", asked: false, rules: [GITHUB_ALLOW_RULE], ok: true },
  { name: "acceptEdits with allow github", mode: "acceptEdits", asked: false, rules: ["allow github"], ok: true },
];

export const ASKED_CASES: readonly DecisionCase[] = ["default", "acceptEdits"].map((mode) => (
  { name: mode, mode, asked: true, rules: [], ok: true }
));

export const DENY_CASES: readonly DecisionCase[] = [
  ...["default", "acceptEdits", "bypassPermissions"].map((mode) => (
    { name: mode, mode, asked: true, rules: ["allow github", "deny github action=create_pr"], ok: false }
  )),
  { name: "a deny of another repository", mode: "bypassPermissions", asked: false, rules: ["deny github repo=other"], ok: true },
  { name: "an allow of another repository", mode: "default", asked: false, rules: ["allow github repo=other"], ok: false },
];

/** What /commit reads for its crew: the github tool and a deny rule. */
export const read = () => ({ githubTool: true, permissionRules: ["deny github"] });

export interface AskCase { name: string; yes: boolean; prAsked: boolean }

export const ASK_CASES: readonly AskCase[] = [
  { name: "confirmed at the prompt", yes: false, prAsked: true },
  { name: "under --yes", yes: true, prAsked: false },
];

/** A read that counts its calls. */
export function countedRead() {
  let reads = 0;
  return { read: () => { reads++; return read(); }, reads: () => reads };
}

export const SESSION_RULES = ["deny github", "not a rule", "allow shell_command command=npm test*"];

/** A create_pr call on head x. */
export const ARGS_X = { action: "create_pr", owner: "o", repo: "r", base: "main", head: "x", title: "t", body: "b" };
