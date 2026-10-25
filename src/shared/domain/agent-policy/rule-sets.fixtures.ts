// The calls the rule sets are tested on, and the rules pathRules is expected to make.
import { gateLine, ruleDecision } from "./permission.ts";
import {
  FOLDER_READ_TOOLS, gitConfigSets, PATH_READ_TOOLS, PATH_WRITE_TOOLS, RULE_SETS, UNSCOPED_WRITE_TOOLS, WRITTEN_TEXT,
} from "./rule-sets.ts";
import type { RuleSetId } from "./rule-sets.ts";
import { WORKSPACE } from "../dev/path-rebase.ts";

/** git-readonly as the dev crews apply it: its rules, then the code's reading of a git config that sets a value. */
export function gitRefused(command: string): boolean {
  return ruleDecision(RULE_SETS["git-readonly"].rules, "shell_command", { command }) === "deny" || gitConfigSets(command);
}

/** Values of one argument of one tool, and whether a set refuses each of them. */
export interface RefusalCase {
  /** The behaviour, as the test name says it. */
  name: string;
  id: RuleSetId;
  tool: string;
  argument: string;
  values: readonly string[];
  refused: boolean;
}

const shell = (id: RuleSetId, name: string, values: readonly string[], refused: boolean): RefusalCase =>
  ({ name, id, tool: "shell_command", argument: "command", values, refused });

/** A private key block inside a source file. */
export const KEY_BLOCK = "const k = `\n-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----\n`;";

export const REFUSAL_CASES: readonly RefusalCase[] = [
  shell("git-readonly", "git-readonly refuses the git forms that change the repository", [
    "git push origin main", "git push", "git -C /x push", "git -C /x push origin main", "git commit -m x",
    "git --no-pager commit -m x", "git -c user.name=x commit", "git add -A", "git stash", "git checkout -- a.ts",
    "git branch -D x", "git tag v1", "git reset --hard", "git worktree add ../w", "git -c a=b push",
    "git commit --amend", "git switch -c b", "git clean -fd", "git restore .", "git cherry-pick abc",
    "git am x.patch", "git apply p.diff", "git mv a b", "git rm a", "git notes add -m x",
    "git update-ref refs/heads/x HEAD", "git reflog expire --all", "git gc", "git fetch", "git pull",
    "git submodule update", "git remote add o u", "git -C /x remote set-url o u", "git stash pop", "git stash -u",
    "git -C /x stash drop",
  ], true),
  shell("git-readonly", "git-readonly refuses git behind a path, an env, an assignment or a chain, and the verbs that write", [
    "env git push", "/usr/bin/git push origin", "cd x && git push", "GIT_DIR=.git git push", "git init",
    "git clone u", "git update-index --add x", "git symbolic-ref HEAD refs/heads/x", "git -c core.pager=x log",
    "git replace a b", "git push;", "git push&&ls", "git commit\n-m x", "git stash pop;",
  ], true),
  shell("git-readonly", "git-readonly lets a git config read, git replace alone, the status and the listings run", [
    "git config user.name", "git config --list", "git config -l", "git replace", "git status", "git stash list",
    "git remote -v",
  ], false),
  shell("git-readonly", "git-readonly refuses git config when an option or a subcommand changes the file", [
    "git config --add a.b c", "git config --unset a.b",
    "git config --unset-all a.b", "git config --replace-all a.b c", "git config --rename-section a b",
    "git config --remove-section a", "git config --edit", "git config -e", "git config set a.b c",
    "git config unset a.b", "git config edit", "git -C /x config --unset a.b",
  ], true),
  shell("git-readonly", "git-readonly lets the reads run", [
    "git status", "git log --oneline -5", "git diff --stat", "git diff -- src/address.ts",
    "git show HEAD:src/commit.ts", "git show HEAD", "git branch", "git tag", "git remote", "git remote -v",
    "git remote show origin", "git stash list", "git stash show -p", "git notes", "git submodule",
    "git rev-parse HEAD", "npm test",
  ], false),
  shell("git-readonly", "git-readonly also refuses the listing forms with arguments: no rule carves an exception", [
    "git branch -a", "git tag -l", "git worktree list",
  ], true),
  shell("inline-interpreters", "inline-interpreters refuses inline code", [
    'bash -c "git push"', "sh -c x", "node -e 1", 'python3 -c "print(1)"',
  ], true),
  shell("inline-interpreters", "inline-interpreters lets a script file run", [
    "bash scripts/smoke-runtime.sh", "node scripts/run-tests.mjs", "npm test",
  ], false),
  shell("inline-interpreters", "inline-interpreters refuses inline code behind a path, an env, a flag cluster or a flag before it", [
    "bash -xc 'x'", "bash -e -c x", "/bin/bash -c x", "env bash -c x", "zsh -c x", "perl -e 1", "npx tsx -e 1",
    "node --input-type=module -e 1", "node -r x -e 1", "python3 -u -c 1", "python3.12 -c 1", "python3.12 -u -c 1",
    "perl -w -e 1", "perl -Mstrict -E 1", "ruby -w -e 1",
  ], true),
  shell("inline-interpreters", "inline-interpreters lets a script, a module and a traced script run", [
    "bash scripts/build.sh", "node script.js", "python3 -m pytest", "sh -x build.sh",
  ], false),
  {
    name: "read-noise refuses reads under build outputs, .git and node_modules, absolute or relative",
    id: "read-noise", tool: "file_read", argument: "path", refused: true,
    values: [
      `${WORKSPACE}/node_modules/x/index.js`, "node_modules/x/index.js", `${WORKSPACE}/.git/config`,
      `${WORKSPACE}/obj/Debug/a.dll`, `${WORKSPACE}/src/bin/cli.js`,
    ],
  },
  {
    name: "read-noise lets the sources, .gitignore and the names that only start like an output be read",
    id: "read-noise", tool: "file_read", argument: "path", refused: false,
    values: [`${WORKSPACE}/src/index.ts`, `${WORKSPACE}/.gitignore`, `${WORKSPACE}/binary/x`, `${WORKSPACE}/docs/bin.md`],
  },
  ...PATH_READ_TOOLS.flatMap((tool): RefusalCase[] => [
    {
      name: `read-noise refuses the same paths to ${tool}, a tool that reads one path`,
      id: "read-noise", tool, argument: "path", values: ["node_modules/x", `${WORKSPACE}/.git/HEAD`], refused: true,
    },
    {
      name: `read-noise lets ${tool} read the sources`,
      id: "read-noise", tool, argument: "path", values: [`${WORKSPACE}/src`, "src/index.ts"], refused: false,
    },
  ]),
  {
    name: "secrets refuses a private key block anywhere in the content and the known token prefixes",
    id: "secrets", tool: "file_write", argument: "content", refused: true,
    values: [
      KEY_BLOCK, "-----BEGIN RSA PRIVATE KEY-----\n", "token: ghp_" + "a".repeat(36), "xoxb-1234567890",
      "id = AKIAABCDEFGHIJKLMNOP", "k=sk-ant-api03-x",
    ],
  },
  {
    name: "secrets lets code, a public key and a certificate be written",
    id: "secrets", tool: "file_write", argument: "content", refused: false,
    values: ["export const x = 1;\n", "-----BEGIN PUBLIC KEY-----", "-----BEGIN CERTIFICATE-----"],
  },
  ...WRITTEN_TEXT.flatMap(([tool, argument]): RefusalCase[] => [
    {
      name: `secrets refuses a token in the ${argument} of ${tool}, a writing tool`,
      id: "secrets", tool, argument, values: ["ghp_x", "a sk-ant-api03-x b"], refused: true,
    },
    {
      name: `secrets lets code be written in the ${argument} of ${tool}`,
      id: "secrets", tool, argument, values: ["export const x = 1;\n"], refused: false,
    },
  ]),
  {
    name: "state-files refuses writes to the files code owns",
    id: "state-files", tool: "file_write", argument: "path", refused: true,
    values: [
      `${WORKSPACE}/workbench/demo/DEMO-BATCHES-STATE.md`, `${WORKSPACE}/workbench/demo/DEMO-STATE-F1.md`,
      `${WORKSPACE}/workbench/demo/DEMO-VERIFY-F2.md`, `${WORKSPACE}/workbench/demo/capture-F2/index.txt`,
      `${WORKSPACE}/.orkeon/repo.yaml`, ".orkeon/config.json", `${WORKSPACE}/.claude/settings.json`, ".claude/x",
    ],
  },
  {
    name: "state-files lets the sources, a plan and the docs be written",
    id: "state-files", tool: "file_write", argument: "path", refused: false,
    values: [`${WORKSPACE}/src/x.ts`, `${WORKSPACE}/workbench/demo/DEMO-PLAN.md`, `${WORKSPACE}/docs/orkeon.md`],
  },
  ...PATH_WRITE_TOOLS.flatMap((tool): RefusalCase[] => [
    {
      name: `state-files leaves a batch's worktree under .orkeon/worktrees writable to ${tool}`,
      id: "state-files", tool, argument: "path", refused: false,
      values: [
        `${WORKSPACE}/.orkeon/worktrees/calc-F1/src/stats.js`, ".orkeon/worktrees/calc-F1/src/stats.test.js",
        `${WORKSPACE}/.orkeon/worktrees/calc-F1/workbench/calc/CALC-PLAN-F1.md`,
      ],
    },
    {
      name: `state-files refuses to ${tool} a worktree's own state under .orkeon/worktrees`,
      id: "state-files", tool, argument: "path", refused: true,
      values: [
        `${WORKSPACE}/.orkeon/worktrees/calc-F1/.orkeon/dev/calc/batches-active.json`,
        `${WORKSPACE}/.orkeon/worktrees/calc-F1/.orkeon/repo.yaml`,
        `${WORKSPACE}/.orkeon/worktrees/calc-F1/workbench/calc/CALC-BATCHES-STATE.md`,
      ],
    },
  ]),
  {
    name: "state-files refuses every entry of .orkeon/ code or the runtime writes, in or out of the project's root",
    id: "state-files", tool: "file_write", argument: "path", refused: true,
    values: [
      ".orkeon/dev/demo/batches-active.json", ".orkeon/dev-learn-state.json", `${WORKSPACE}/.orkeon/memory/entries/a.md`,
      ".orkeon/agent-memory/x.json", ".orkeon/agents.json", ".orkeon/sessions/last.json", ".orkeon/hooks/pre.sh",
      ".orkeon/shared/x", ".orkeon/config.json", ".orkeon/state.json", "src/crews/.orkeon/orkeon.d.ts",
      ".orkeon/ORKEON_COMMITMSG", ".orkeon/forge/x", ".orkeon/rag/x",
    ],
  },
  ...PATH_WRITE_TOOLS.flatMap((tool): RefusalCase[] => [
    {
      name: `state-files refuses the same paths to ${tool}, a tool that writes one path`,
      id: "state-files", tool, argument: "path", values: [".claude/x", `${WORKSPACE}/.orkeon/repo.yaml`], refused: true,
    },
    {
      name: `state-files lets ${tool} write the sources`,
      id: "state-files", tool, argument: "path", values: [`${WORKSPACE}/src/x.ts`], refused: false,
    },
  ]),
];

/** Commands git-readonly refuses only with the code's reading of a git config that sets a value. */
export interface GitConfigCase {
  name: string;
  commands: readonly string[];
  refused: boolean;
}

export const GIT_CONFIG_CASES: readonly GitConfigCase[] = [
  {
    name: "git-readonly, read with the code, refuses a git config that sets the hooks path or a global value",
    commands: ["git config core.hooksPath /tmp/h", "git config --global user.name x"],
    refused: true,
  },
  {
    // A key then a value: the gate's glob cannot tell it from a read with a dotted file name, the code does.
    name: "git-readonly, read with the code, refuses git config with a key then a value, wherever it hides",
    refused: true,
    commands: [
      "git config user.name x", "git config --local a.b c", "git -C /x config a.b c", "git --git-dir=.git config a.b c",
      "git config --file a.cfg a.b c", "git config -f a.cfg a.b c", "cd x && git config a.b c", "/usr/bin/git config a.b c",
      "git status; git config a.b c", "git config --type=bool a.b true", "GIT_DIR=x git config 'a.b' \"c d\"",
      // In a subshell, a substitution, a group or an eval'd string; a value that starts with an operator.
      "(git config core.pager x)", "echo $(git config core.pager x)", "`git config alias.x '!sh'`",
      "echo \"$(git config a.b c)\"", "{ git config a.b c; }", "eval 'git config a.b c'", "git config core.pager ';evil'",
      "git config core.pager '&& evil'", "git config core.pager $'\\nevil'", "g\\it config a.b c",
      // A changing option or subcommand behind another option, which the gate reads right after `config` only.
      "git config --global --unset core.hooksPath", "git config --local --remove-section core",
      "git config --global --add a.b c", "git config -f a.cfg --edit", "git config --global set a.b c",
      "git config --global --rename-section a b", "git config --system --replace-all a.b c",
    ],
  },
  {
    name: "git-readonly, read with the code, lets the reads of git config run",
    refused: false,
    commands: [
      "git config --get user.name", "git config --global --get user.name", "git config --get-all a.b",
      "git config --get-regexp remote", "git config --list --show-origin", "git config get user.name",
      "git -C /x config --get user.email", "git config user.name", "git config --file a.cfg --list",
      "git config -f .gitmodules --get submodule.x.path", "git config --file=a.cfg --get a.b", "git config -l",
      "git config --blob HEAD:.gitmodules --list", "git log -- a.b c.d", "git config --get a.b && ls x y",
    ],
  },
];

/** One call and whether a set refuses it. */
export interface CallCase {
  name: string;
  id: RuleSetId;
  tool: string;
  args: Record<string, unknown>;
  refused: boolean;
}

export const CALL_CASES: readonly CallCase[] = [
  {
    // A -c after a script is the script's: inline-interpreters reads -c after the interpreter or another option only.
    name: "inline-interpreters lets a script run with a -c of its own",
    id: "inline-interpreters", tool: "shell_command", args: { command: "python3 x.py -c" }, refused: false,
  },
  {
    name: "read-noise lets a file be written under node_modules: it refuses reads only",
    id: "read-noise", tool: "file_write", args: { path: `${WORKSPACE}/node_modules/x` }, refused: false,
  },
  {
    name: "read-noise refuses a grep under node_modules",
    id: "read-noise", tool: "grep", args: { path: "node_modules/x", pattern: "TODO" }, refused: true,
  },
  {
    name: "read-noise lets a glob from the root run, whatever its pattern",
    id: "read-noise", tool: "glob", args: { path: WORKSPACE, pattern: "node_modules/**" }, refused: false,
  },
  {
    name: "secrets lets a path that holds a key block be read",
    id: "secrets", tool: "file_read", args: { path: KEY_BLOCK }, refused: false,
  },
  {
    name: "secrets refuses a token in the text of a node_replace",
    id: "secrets", tool: "node_replace", args: { path: "src/a.ts", selector: "f", text: "ghp_x" }, refused: true,
  },
  {
    name: "secrets lets edit_file replace a token away",
    id: "secrets", tool: "edit_file", args: { old_string: "ghp_x", new_string: "y" }, refused: false,
  },
  {
    name: "secrets leaves edit_batch to the crews' callback",
    id: "secrets", tool: "edit_batch", args: { operations: [] }, refused: false,
  },
  {
    name: "state-files refuses an edit_file under .claude",
    id: "state-files", tool: "edit_file", args: { path: ".claude/x", old_string: "a", new_string: "b" }, refused: true,
  },
  ...UNSCOPED_WRITE_TOOLS.map((tool): CallCase => ({
    name: `state-files refuses ${tool}, an unscoped writer, whole`,
    id: "state-files", tool, args: {}, refused: true,
  })),
  {
    name: "state-files lets structural_search run",
    id: "state-files", tool: "structural_search", args: { pattern: "x" }, refused: false,
  },
];

/** A rule of a set and the gate line it reads as. Each set's first rules are those it held before Orkeon #180, in their order. */
export const GATE_LINE_CASES: readonly { id: RuleSetId; index: number; line: string }[] = [
  { id: "git-readonly", index: 0, line: "deny shell_command command=*git add*" },
  { id: "read-noise", index: 7, line: "deny file_read path=node_modules/*" },
  { id: "read-noise", index: 8, line: "deny glob path=*/bin/*" },
  { id: "secrets", index: 15, line: "deny file_write content=*sk-ant-*" },
  { id: "secrets", index: 127, line: "deny structural_rewrite fix=*sk-ant-*" },
  { id: "state-files", index: 18, line: "deny file_write path=.claude/*" },
  { id: "state-files", index: -1, line: "deny structural_rewrite" },
];

/** The rules pathRules("write", ["./tests/", "/workspace/src/shared/domain", "tests"]) makes, as gate lines. */
export const WRITE_ROOT_RULES: readonly string[] = [
  ...PATH_WRITE_TOOLS.flatMap((tool) => [`deny ${tool} path=${WORKSPACE}/tests/*`, `deny ${tool} path=tests/*`]),
  ...PATH_WRITE_TOOLS.flatMap((tool) => [
    `deny ${tool} path=${WORKSPACE}/src/shared/domain/*`, `deny ${tool} path=src/shared/domain/*`,
  ]),
  "deny structural_rewrite",
];

/** The rules pathRules("read", ["tests"]) makes, as gate lines. */
export const READ_ROOT_RULES: readonly string[] = [
  ...PATH_READ_TOOLS.flatMap((tool) => [`deny ${tool} path=${WORKSPACE}/tests/*`, `deny ${tool} path=tests/*`]),
  ...FOLDER_READ_TOOLS.flatMap((tool) => [`deny ${tool} path=${WORKSPACE}/tests`, `deny ${tool} path=tests`]),
  "deny structural_search", "deny symbol_source",
];

/** Calls and what the rules of a read root `tests` decide for them. */
export const READ_ROOT_DECISIONS: readonly { name: string; tool: string; args: Record<string, unknown>; decision: "deny" | undefined }[] = [
  { name: "denies a directory_search of the root itself", tool: "directory_search", args: { path: "tests", query: "x" }, decision: "deny" },
  { name: "denies symbol_source whole", tool: "symbol_source", args: { fqn: "a.b" }, decision: "deny" },
  { name: "denies a grep under the root", tool: "grep", args: { path: "tests/a", pattern: "x" }, decision: "deny" },
  { name: "denies a grep of the root itself", tool: "grep", args: { path: "tests", pattern: "x" }, decision: "deny" },
  { name: "denies a glob of the absolute root", tool: "glob", args: { path: `${WORKSPACE}/tests`, pattern: "*.ts" }, decision: "deny" },
  { name: "denies a count_pattern of the root itself", tool: "count_pattern", args: { path: "tests", patterns: ["x"] }, decision: "deny" },
  { name: "leaves a file_read of the root itself to the mode", tool: "file_read", args: { path: "tests" }, decision: undefined },
  { name: "denies a node_read under the absolute root", tool: "node_read", args: { path: `${WORKSPACE}/tests/a.ts`, selector: "f" }, decision: "deny" },
  { name: "leaves a grep of another folder to the mode", tool: "grep", args: { path: "src", pattern: "x" }, decision: undefined },
];

/** Roots no rule can be made on, and why. */
export const ROOTS_WITHOUT_RULE: readonly string[] = ["", WORKSPACE, "../x", "src/*", "/etc"];
export const ROOTS_WITHOUT_RULE_PROBLEMS: readonly string[] = [
  "root '' names the whole project: no rule",
  `root '${WORKSPACE}' names the whole project: no rule`,
  "root '../x' climbs out with '..': no rule",
  "root 'src/*' holds '*': a rule on it would cover more than the folder",
  `root '/etc' is outside ${WORKSPACE}: no rule`,
];

/** A held allow line, then every line of read-noise. */
export function linesWithReadNoise(): string[] {
  return ["allow shell_command command=npm test*", ...RULE_SETS["read-noise"].rules.map(gateLine)];
}
