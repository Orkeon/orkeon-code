// The rule sets Orkeon Code ships — pure data, no IO. Each set is a list of deny rules in the
// /permissions syntax, handed to the host gate by the commands that run a dev step
// (shared/domain/dev/step-rules.ts says which step gets which set), and checked again by the dev crews'
// onToolCall (shared/domain/dev/call-guard.ts), the only check of them under `orkeon run`. Both see the
// model's calls only; a call made from Orkeon Code's own code is not checked (docs/permissions.md).
// Every rule here names an argument but the whole-tool denies of the writing tools whose paths sit in an
// array the gate cannot read (UNSCOPED_WRITE_TOOLS): those remove their tool from the catalogue. edit_batch is
// not one of them: the crews' callback checks each of its operations as the editor it stands for (call-guard.ts).

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
  // A key then a value sets it (git config user.name x, git config --global a.b x): a dot, then a space after it;
  // the options and subcommands that change the file. `--get a.b`, `-l`, `a.b` alone and `get` only read.
  config: [
    "*.* *", "--add", "--unset", "--replace-all", "--rename-section", "--remove-section", "--edit", "-e",
    "set", "unset", "rename-section", "remove-section", "edit",
  ],
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

/** The tools that read one file or folder named by `path`. */
export const PATH_READ_TOOLS: readonly string[] = [
  "file_read", "glob", "grep", "node_outline", "node_read", "count_pattern", "documents_of", "directory_search",
];
/** The tools of PATH_READ_TOOLS whose `path` may name a folder, the denied root itself included. */
export const FOLDER_READ_TOOLS: readonly string[] = ["glob", "grep", "count_pattern", "directory_search"];
/** The reading tools that name no path the gate could match (a pattern over the project, a symbol's fqn): denied
 *  whole once a root is closed to reading. */
export const UNSCOPED_READ_TOOLS: readonly string[] = ["structural_search", "symbol_source"];
/** The tools that write one file named by `path`. */
export const PATH_WRITE_TOOLS: readonly string[] = ["file_write", "edit_file", "node_replace", "node_insert", "node_ensure"];
/** The written text of each writing tool that takes it as one string. */
export const WRITTEN_TEXT: ReadonlyArray<readonly [tool: string, argument: string]> = [
  ["file_write", "content"], ["edit_file", "new_string"], ["node_replace", "text"], ["node_insert", "text"],
  ["node_ensure", "text"], ["node_ensure", "name"], ["node_ensure", "module"], ["structural_rewrite", "fix"],
];
/** Writing tools whose paths sit in an array the gate reads as its type name, never an element: denied whole
 *  where paths are protected. */
export const UNSCOPED_WRITE_TOOLS: readonly string[] = ["structural_rewrite"];
/** The writing tool whose paths and texts sit in its `operations`: the gate cannot read them, the dev crews'
 *  callback reads each operation as the editor of OPERATION_TOOLS it stands for and applies the rules of that
 *  editor to it. Every call of it runs under that callback during a step, so no set denies it whole. */
export const OPERATIONS_TOOL = "edit_batch";
/** The editor each `kind` of an edit_batch operation stands for: the intent operations are node_ensure's. */
export const OPERATION_TOOLS: Readonly<Record<string, string>> = {
  node_replace: "node_replace", node_insert: "node_insert",
  ensure_using: "node_ensure", ensure_import: "node_ensure", ensure_field: "node_ensure", ensure_member: "node_ensure",
  ensure_section: "node_ensure", insert_under_heading: "node_ensure", replace_mermaid: "node_ensure",
};

/** A deny on every call of each tool. */
function denyWhole(tools: readonly string[]): PermissionRule[] {
  return tools.map((tool): PermissionRule => ({ effect: "deny", tool }));
}

/** The same patterns on `argument` of each tool, tool by tool. */
function denyEach(tools: readonly string[], argument: string, patterns: readonly string[]): PermissionRule[] {
  return tools.flatMap((tool) => denyAll(tool, argument, patterns));
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
    // refused too, a side effect of matching any word ending with `sh`. `python3.*` names a versioned python
    // (python3.12). The dev crews' callback also matches the command as the program receives it, quotes and
    // repeated spaces gone and option clusters split (python3 -Ic, perl -we): shellCommandForms.
    rules: denyAll("shell_command", "command", [
      "*sh -c*", "*sh -*c *", "*sh -* -c*",
      "*node -e*", "*node --eval*", "*node -p*", "*node --print*", "*node -* -e*", "*node -* -p*", "*node --input-type*",
      "*python -c*", "*python3 -c*", "*python3.* -c*", "*python -* -c*", "*python3 -* -c*", "*python3.* -* -c*",
      "*perl -e*", "*perl -E*", "*perl -* -e*", "*perl -* -E*", "*ruby -e*", "*ruby -* -e*", "*php -r*",
      "*tsx -e*", "*tsx --eval*", "*ts-node -e*", "*deno eval*", "*bun -e*",
    ]),
  },
  "read-noise": {
    id: "read-noise",
    title: "reads under build outputs, version-control internals and installed packages",
    // Each folder twice: inside a path, and as the start of a path relative to the project.
    rules: denyEach(PATH_READ_TOOLS, "path", [
      "*/bin/*", "bin/*", "*/obj/*", "obj/*", "*/.git/*", ".git/*", "*/node_modules/*", "node_modules/*",
    ]),
  },
  secrets: {
    id: "secrets",
    title: "a private key block or a token with a known prefix in written content",
    // The prefixes of SECRET_PATTERNS (secret-patterns.ts) a whole-content pattern can hold without refusing
    // ordinary text; the others need a check of the content itself. edit_batch's texts sit in its
    // operations, which the crews' callback reads as node_replace, node_insert or node_ensure texts.
    rules: WRITTEN_TEXT.flatMap(([tool, argument]) => denyAll(tool, argument, [
      "*-----BEGIN *PRIVATE KEY-----*",
      "*ghp_*", "*gho_*", "*ghu_*", "*ghs_*", "*ghr_*", "*github_pat_*",
      "*xoxa-*", "*xoxb-*", "*xoxp-*", "*xoxo-*", "*xoxs-*", "*xoxr-*",
      "*AKIA*",
      "*AIza*",
      "*sk-ant-*",
    ])),
  },
  "state-files": {
    id: "state-files",
    title: "files only Orkeon Code's own code writes",
    // Batch logs, batch states, verdicts and audit captures; the state folder; the harness's deployed files.
    rules: [
      ...denyEach(PATH_WRITE_TOOLS, "path", [
        "*-BATCHES-STATE.md", "*-STATE-F*.md", "*-VERIFY-F*.md", "*/capture-F*/*",
        "*/.orkeon/*", ".orkeon/*", "*/.claude/*", ".claude/*",
      ]),
      ...denyWhole(UNSCOPED_WRITE_TOOLS),
    ],
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

/** Deny rules on the folders `roots` for the tools of one access, and why a root got none. */
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

/** For each kept root, two rules (absolute, relative) per tool of PATH_READ_TOOLS or PATH_WRITE_TOOLS, and for
 *  `read` two more per tool of FOLDER_READ_TOOLS on the root itself (`<root>/*` does not match `<root>`); then,
 *  once a root is kept, a deny on the tools whose paths the gate cannot read: UNSCOPED_READ_TOOLS for `read`,
 *  UNSCOPED_WRITE_TOOLS for `write` (edit_batch's operations are checked one by one, as their editors). */
export function pathRules(access: "read" | "write", roots: readonly string[]): PathRules {
  const tools = access === "read" ? PATH_READ_TOOLS : PATH_WRITE_TOOLS;
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
    rules.push(...denyEach(tools, "path", [`${PROJECT}/${root}/*`, `${root}/*`]));
    if (access === "read") rules.push(...denyEach(FOLDER_READ_TOOLS, "path", [`${PROJECT}/${root}`, root]));
  }
  if (seen.size > 0) rules.push(...denyWhole(access === "read" ? UNSCOPED_READ_TOOLS : UNSCOPED_WRITE_TOOLS));
  return { rules, problems };
}

/** The tool the rewrite rule denies: a whole write of a file. */
export const REWRITE_TOOL = "file_write";

/** The rewrite rule of a writing role: `file_write` denied (absolute and relative) under every kept root and on every
 *  kept file pattern, so that an existing source file is changed by node or with edit_file, never written whole. The
 *  dev crews' callback lifts it for a file that does not exist yet (call-guard.ts): a new file is still created.
 *  What a root or a pattern gets no rule for is said by pathRules and patternWriteRules already. */
export function rewriteRules(roots: readonly string[], patterns: readonly string[]): PermissionRule[] {
  const kept = new Set<string>();
  for (const raw of roots) {
    const root = normaliseRoot(raw);
    if (rootProblem(raw, root) === undefined) kept.add(`${root}/*`);
  }
  for (const raw of patterns) {
    const pattern = normaliseRoot(raw);
    if (pattern !== "" && pattern !== "*" && !pattern.startsWith("/") && !pattern.split("/").includes("..")) kept.add(pattern);
  }
  return [...kept].flatMap((p) => denyAll(REWRITE_TOOL, "path", [`${PROJECT}/${p}`, p]));
}

/** Write denies on file patterns rather than folders (a pack's `layout.test_files`, `*` spanning folders): two rules
 *  (absolute, relative) per tool of PATH_WRITE_TOOLS for each kept pattern, then the deny on UNSCOPED_WRITE_TOOLS.
 *  A pattern that is empty, outside the project or climbing out with `..` gets no rule. */
export function patternWriteRules(patterns: readonly string[]): PathRules {
  const rules: PermissionRule[] = [];
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const raw of patterns) {
    const pattern = normaliseRoot(raw);
    if (pattern === "" || pattern === "*") { problems.push(`pattern '${raw}' covers the whole project: no rule`); continue; }
    if (pattern.startsWith("/")) { problems.push(`pattern '${raw}' is outside ${PROJECT}: no rule`); continue; }
    if (pattern.split("/").includes("..")) { problems.push(`pattern '${raw}' climbs out with '..': no rule`); continue; }
    if (seen.has(pattern)) continue;
    seen.add(pattern);
    rules.push(...denyEach(PATH_WRITE_TOOLS, "path", [`${PROJECT}/${pattern}`, pattern]));
  }
  if (seen.size > 0) rules.push(...denyWhole(UNSCOPED_WRITE_TOOLS));
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
