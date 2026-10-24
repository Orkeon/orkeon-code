// The rule sets Orkeon Code ships — pure data, no IO. Each set is a list of deny rules in the
// /permissions syntax, handed to the host gate by the commands that run a dev step
// (shared/domain/dev/step-rules.ts says which step gets which set). The gate enforces them on the
// model's calls only; a call made from Orkeon Code's own code is not checked (docs/permissions.md).
// Every rule here names an argument, so no set removes a tool from a catalogue.

import { gateLine, sameCalls } from "./permission.ts";
import type { PermissionRule } from "./permission.ts";

export type RuleSetId = "git-readonly" | "inline-interpreters" | "read-noise" | "secrets" | "state-files";

export interface RuleSet {
  id: RuleSetId;
  /** One line, for /permissions and the docs. */
  title: string;
  rules: readonly PermissionRule[];
}

/** Every set, in this order (listing order, step order). */
export const RULE_SET_IDS: readonly RuleSetId[] = [
  "git-readonly", "inline-interpreters", "read-noise", "secrets", "state-files",
];

/** A git verb that changes the repository; `bareLists` when the verb alone only lists (git branch, git tag);
 *  `subcommands` when only some of its subcommands change something (git stash pop, git remote add), so that
 *  the listing ones (git stash list, git remote -v) still run. */
export interface GitVerb { verb: string; bareLists: boolean; subcommands?: readonly string[] }

const LISTING_VERBS = new Set(["branch", "notes", "reflog", "remote", "replace", "submodule", "tag"]);
const VERB_SUBCOMMANDS: Readonly<Record<string, readonly string[]>> = {
  // Two arguments or more set or unset a key (git config key value, git config --global key); one reads it.
  config: ["* *", "--edit", "-e"],
  remote: ["add", "remove", "rm", "rename", "set-url", "set-head", "set-branches", "prune", "update"],
  // `-*`: a push given by its options alone (git stash -u).
  stash: ["push", "pop", "apply", "drop", "clear", "save", "store", "branch", "-*"],
};

export const GIT_MUTATING_VERBS: readonly GitVerb[] = [
  "add", "am", "apply", "branch", "checkout", "checkout-index", "cherry-pick", "clean", "clone", "commit",
  "commit-tree", "config", "fast-import", "fetch", "filter-branch", "gc", "init", "maintenance", "merge", "mktag",
  "mktree", "mv", "notes", "prune", "pull", "push", "read-tree", "rebase", "reflog", "remote", "repack", "replace",
  "reset", "restore", "revert", "rm", "stash", "submodule", "switch", "symbolic-ref", "tag", "update-index",
  "update-ref", "update-server-info", "worktree", "write-tree",
].map((verb) => {
  const subcommands = VERB_SUBCOMMANDS[verb];
  const entry: GitVerb = { verb, bareLists: LISTING_VERBS.has(verb) };
  return subcommands === undefined ? entry : { ...entry, subcommands };
});

/** A word and the same word with arguments after it; a word that already ends with `*` stands alone. */
function withArguments(head: string): string[] {
  return head.endsWith("*") ? [head] : [head, `${head} *`];
}

/** The leads of every git pattern: `*` before the word admits a path, an `env`, an assignment or a chain
 *  (`/usr/bin/git`, `GIT_DIR=x git`, `cd x && git`); the gate's `*` also matches nothing (plain `git push`). */
const GIT_LEADS = ["*git", "*git *"] as const;

/** The patterns of one verb. Directly after `git`, the verb and whatever follows it are one prefix pattern
 *  (`*git push*`: `git push;`, `git push&&ls`, `git commit` then a line break), unless the verb alone only lists.
 *  Behind global options (`git -C /x …`) the verb is bounded by spaces, since `*git * am*` would also match
 *  `git log -- amend.md`. For a verb with subcommands, only those (and the bare verb when it changes something). */
function gitPatterns({ verb, bareLists, subcommands }: GitVerb): string[] {
  const prefixed = (head: string): string => (head.endsWith("*") ? `*git ${head}` : `*git ${head}*`);
  const bare = bareLists ? [] : [verb];
  if (subcommands === undefined) {
    const direct = bareLists ? `*git ${verb} *` : prefixed(verb);
    return [direct, ...bare.map((v) => `*git * ${v}`), `*git * ${verb} *`];
  }
  const heads = subcommands.map((sub) => `${verb} ${sub}`);
  return [
    ...bare.map((v) => `*git ${v}`), ...heads.map(prefixed),
    ...bare.map((v) => `*git * ${v}`), ...heads.flatMap((head) => withArguments(`*git * ${head}`)),
  ];
}

function denyAll(tool: string, argument: string, patterns: readonly string[]): PermissionRule[] {
  return patterns.map((pattern): PermissionRule => ({ effect: "deny", tool, argument, pattern }));
}

export const RULE_SETS: Readonly<Record<RuleSetId, RuleSet>> = {
  "git-readonly": {
    id: "git-readonly",
    title: "git commands that change the repository, its branches or its remotes",
    rules: denyAll("shell_command", "command", [
      ...GIT_MUTATING_VERBS.flatMap(gitPatterns),
      // `-c key=value` sets a config for one command, and core.pager or core.sshCommand run a program.
      ...GIT_LEADS.map((lead) => `${lead} -c *`),
    ]),
  },
  "inline-interpreters": {
    id: "inline-interpreters",
    title: "code handed inline to an interpreter, which could run what the other rules refuse",
    // `*sh -c*` covers bash, sh, zsh, dash, ksh and fish behind a path or an `env`; `*sh -*c *` a flag cluster
    // (bash -xc), `*sh -* -c*` a flag before `-c`; the same for the other interpreters. `ssh -c <cipher>` is
    // refused too, a side effect of matching any word ending with `sh`.
    rules: denyAll("shell_command", "command", [
      "*sh -c*", "*sh -*c *", "*sh -* -c*",
      "*node -e*", "*node --eval*", "*node -p*", "*node --print*", "*node -* -e*", "*node -* -p*", "*node --input-type*",
      "*python -c*", "*python3 -c*", "*python -* -c*", "*python3 -* -c*",
      "*perl -e*", "*perl -E*", "*ruby -e*", "*php -r*",
      "*tsx -e*", "*tsx --eval*", "*ts-node -e*", "*deno eval*", "*bun -e*",
    ]),
  },
  "read-noise": {
    id: "read-noise",
    title: "reads under build outputs, version-control internals and installed packages",
    // Each folder twice: inside a path, and as the start of a path relative to the project.
    rules: denyAll("file_read", "path", [
      "*/bin/*", "bin/*", "*/obj/*", "obj/*", "*/.git/*", ".git/*", "*/node_modules/*", "node_modules/*",
    ]),
  },
  secrets: {
    id: "secrets",
    title: "a private key block or a token with a known prefix in written content",
    // The prefixes of SECRET_PATTERNS (secret-patterns.ts) a whole-content pattern can hold without refusing
    // ordinary text; the others need a check of the content itself.
    rules: denyAll("file_write", "content", [
      "*-----BEGIN *PRIVATE KEY-----*",
      "*ghp_*", "*gho_*", "*ghu_*", "*ghs_*", "*ghr_*", "*github_pat_*",
      "*xoxa-*", "*xoxb-*", "*xoxp-*", "*xoxo-*", "*xoxs-*", "*xoxr-*",
      "*AKIA*",
      "*AIza*",
      "*sk-ant-*",
    ]),
  },
  "state-files": {
    id: "state-files",
    title: "files only Orkeon Code's own code writes",
    // Batch logs, batch states, verdicts and audit captures; the state folder; the harness's deployed files.
    rules: denyAll("file_write", "path", [
      "*-BATCHES-STATE.md", "*-STATE-F*.md", "*-VERIFY-F*.md", "*/capture-F*/*",
      "*/.orkeon/*", ".orkeon/*", "*/.claude/*", ".claude/*",
    ]),
  },
};

/** The rules of `ids`, in that order, each set's in its own order; a rule on the same calls with the same
 *  effect as an earlier one is kept once. */
export function rulesOf(ids: readonly RuleSetId[]): PermissionRule[] {
  const out: PermissionRule[] = [];
  for (const rule of ids.flatMap((id) => RULE_SETS[id].rules)) {
    if (!out.some((kept) => kept.effect === rule.effect && sameCalls(kept, rule))) out.push(rule);
  }
  return out;
}

/** Deny rules on the folders `roots` for `tool`, and why a root got none. */
export interface PathRules { rules: PermissionRule[]; problems: string[] }

const PROJECT = "/workspace";

/** A root as a path relative to the project: no `/workspace/` or `./` in front, no `/` behind. */
function normaliseRoot(raw: string): string {
  let root = raw.trim();
  if (root === PROJECT) root = "";
  if (root.startsWith(`${PROJECT}/`)) root = root.slice(PROJECT.length + 1);
  while (root.startsWith("./")) root = root.slice(2);
  while (root.endsWith("/")) root = root.slice(0, -1);
  return root;
}

function rootProblem(raw: string, root: string): string | undefined {
  if (root === "") return `root '${raw}' names the whole project: no rule`;
  if (root.startsWith("/")) return `root '${raw}' is outside ${PROJECT}: no rule`;
  if (root.split("/").includes("..")) return `root '${raw}' climbs out with '..': no rule`;
  if (root.includes("*")) return `root '${raw}' holds '*': a rule on it would cover more than the folder`;
  return undefined;
}

export function pathRules(tool: "file_read" | "file_write", roots: readonly string[]): PathRules {
  const rules: PermissionRule[] = [];
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const raw of roots) {
    const root = normaliseRoot(raw);
    const problem = rootProblem(raw, root);
    if (problem !== undefined) {
      problems.push(problem);
      continue;
    }
    if (seen.has(root)) continue;
    seen.add(root);
    rules.push(...denyAll(tool, "path", [`${PROJECT}/${root}/*`, `${root}/*`]));
  }
  return { rules, problems };
}

/** The gate's lines that belong to a built-in set, counted per set (RULE_SET_IDS order, sets with
 *  count 0 left out), and the lines that belong to none, in their order. */
export interface HeldSets { sets: Array<{ id: RuleSetId; count: number }>; rest: string[] }

export function heldRuleSets(lines: readonly string[]): HeldSets {
  const counts = new Map<RuleSetId, number>();
  const rest: string[] = [];
  for (const line of lines) {
    const id = RULE_SET_IDS.find((set) => RULE_SETS[set].rules.some((rule) => gateLine(rule) === line));
    if (id === undefined) rest.push(line);
    else counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const sets = RULE_SET_IDS.flatMap((id) => {
    const count = counts.get(id) ?? 0;
    return count === 0 ? [] : [{ id, count }];
  });
  return { sets, rest };
}
