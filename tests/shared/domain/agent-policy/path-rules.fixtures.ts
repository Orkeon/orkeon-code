// Three hosts, the lists a user and a project may write, and the calls the lists judge.
import { IDENTITY_HOST, type HostLayout } from "../../../../src/shared/domain/host-layout.ts";
import type { PathLists, PathListValues, PathListsParse } from "../../../../src/shared/domain/agent-policy/path-rules.ts";

const STATE = ["output", "tmp", "user-config", "memory"];
const STATE_POSIX = "/home/me/.orkeon-code/projects/x";
const STATE_WIN = "C:\\Users\\me\\.orkeon-code\\projects\\x";
const STATE_UNC = "\\\\wsl.localhost\\Ubuntu\\home\\me\\.orkeon-code\\projects\\x";
export const PROJECT_WIN = "C:\\ici est\\mon repertoire";
const PROJECT_MNT = "/mnt/c/ici est/mon repertoire";

/** Inside a WSL distribution, the project on the Windows disk, the state in the distribution. */
export const WSL: HostLayout = {
  flavour: "wsl", distro: "Ubuntu", automountRoot: "/mnt",
  mounts: [
    { virtual: "/workspace", posix: PROJECT_MNT, windows: PROJECT_WIN },
    ...STATE.map((m) => ({ virtual: `/${m}`, posix: `${STATE_POSIX}/${m}`, windows: `${STATE_UNC}\\${m}` })),
  ],
};

/** Native Windows. */
export const WINDOWS: HostLayout = {
  flavour: "windows", automountRoot: "/mnt",
  mounts: [{ virtual: "/workspace", windows: PROJECT_WIN }, ...STATE.map((m) => ({ virtual: `/${m}`, windows: `${STATE_WIN}\\${m}` }))],
};

/** A posix host whose launcher wrote its bases. */
export const POSIX: HostLayout = {
  flavour: "posix", automountRoot: "/mnt",
  mounts: [{ virtual: "/workspace", posix: "/home/me/projects/x" }, ...STATE.map((m) => ({ virtual: `/${m}`, posix: `${STATE_POSIX}/${m}` }))],
};

export const NONE: PathListValues = {};
const SECRETS_PATTERNS = ["/workspace/secrets", "/workspace/secrets/*"];
const SRC_PATTERNS = ["/workspace/src", "/workspace/src/*"];

export interface ReadCase {
  name: string;
  user: PathListValues;
  project: PathListValues;
  layout: HostLayout;
  expected: PathListsParse;
}

const lists = (deny: string[], allow: string[] = [], problems: string[] = []): PathListsParse => ({ deny, allow, problems });

export const READ_CASES: readonly ReadCase[] = [
  { name: "a bare folder covers itself and what is below it", user: { deny: "/workspace/secrets" }, project: NONE, layout: POSIX, expected: lists(SECRETS_PATTERNS) },
  {
    name: "a relative entry goes under the project, a trailing separator dropped",
    user: { deny: "secrets/keys, .env/" }, project: NONE, layout: POSIX,
    expected: lists(["/workspace/secrets/keys", "/workspace/secrets/keys/*", "/workspace/.env", "/workspace/.env/*"]),
  },
  {
    name: "a Windows spelling of the project's base on native Windows",
    user: { deny: `${PROJECT_WIN}\\secrets\\` }, project: NONE, layout: WINDOWS, expected: lists(SECRETS_PATTERNS),
  },
  {
    name: "a re-cased drive spelling under WSL",
    user: { deny: "/mnt/C/Ici Est/mon repertoire/secrets" }, project: NONE, layout: WSL, expected: lists(SECRETS_PATTERNS),
  },
  { name: "a backslash relative entry on Windows", user: { deny: "secrets\\k" }, project: NONE, layout: WINDOWS, expected: lists(["/workspace/secrets/k", "/workspace/secrets/k/*"]) },
  { name: "a pattern is kept as written", user: { deny: "/workspace/*.pem" }, project: NONE, layout: POSIX, expected: lists(["/workspace/*.pem"]) },
  { name: "an entry given twice stands once", user: { deny: "/workspace/secrets, secrets" }, project: NONE, layout: POSIX, expected: lists(SECRETS_PATTERNS) },
  {
    name: "a drive under no mount, the root and an automount path under no mount are left out, each named",
    user: { deny: "D:\\elsewhere\\x, /, /mnt/d/x" }, project: NONE, layout: WSL,
    expected: lists([], [], [
      "paths.deny (user): 'D:\\elsewhere\\x' is under no mount of this host: no rule",
      "paths.deny (user): '/' names every path: no rule",
      "paths.deny (user): '/mnt/d/x' is under no mount of this host: no rule",
    ]),
  },
  {
    name: "a Windows spelling on a posix host is under no mount",
    user: { deny: "C:\\x" }, project: NONE, layout: POSIX, expected: lists([], [], ["paths.deny (user): 'C:\\x' is under no mount of this host: no rule"]),
  },
  {
    name: "a project deny is added to the user's",
    user: { deny: "/workspace/secrets" }, project: { deny: "/workspace/keys" }, layout: POSIX,
    expected: lists([...SECRETS_PATTERNS, "/workspace/keys", "/workspace/keys/*"]),
  },
  {
    name: "a project allow within the user's is kept",
    user: { allow: "/workspace/src" }, project: { allow: "/workspace/src/app" }, layout: POSIX,
    expected: lists([], [...SRC_PATTERNS, "/workspace/src/app", "/workspace/src/app/*"]),
  },
  {
    name: "a project allow wider than the user's is dropped and named",
    user: { allow: "/workspace/src" }, project: { allow: "/workspace" }, layout: POSIX,
    expected: lists([], SRC_PATTERNS, ["paths.allow (project): '/workspace' is outside the user's list; a project file may only narrow it"]),
  },
  {
    name: "a project allow in another case is within the user's on Windows",
    user: { allow: "/workspace/src" }, project: { allow: "/workspace/SRC/app" }, layout: WINDOWS,
    expected: lists([], [...SRC_PATTERNS, "/workspace/SRC/app", "/workspace/SRC/app/*"]),
  },
  {
    name: "a project allow stands whole when the user allows nothing in particular",
    user: NONE, project: { allow: "/workspace/src" }, layout: POSIX, expected: lists([], SRC_PATTERNS),
  },
  { name: "empty values give empty lists", user: { deny: "", allow: undefined }, project: { deny: " , " }, layout: POSIX, expected: lists([]) },
];

export const SECRETS: PathLists = { deny: SECRETS_PATTERNS, allow: [] };
export const SRC_ONLY: PathLists = { deny: [], allow: SRC_PATTERNS };
export const BOTH: PathLists = { deny: SECRETS_PATTERNS, allow: ["/workspace", "/workspace/*"] };
export const OUTPUT_SECRETS: PathLists = { deny: ["/output/secrets", "/output/secrets/*"], allow: [] };
export const EMPTY: PathLists = { deny: [], allow: [] };

export interface CoverCase { name: string; tool: string; input: Record<string, unknown>; covered: boolean }

/** What the gate rules of SECRETS cover, by the gate's own reading of them. */
export const SECRETS_RULE_COVERAGE: readonly CoverCase[] = [
  { name: "a file under the folder, absolute", tool: "file_read", input: { path: "/workspace/secrets/k" }, covered: true },
  { name: "a file under the folder, relative", tool: "edit_file", input: { path: "secrets/k", old_string: "a", new_string: "b" }, covered: true },
  { name: "the folder itself for a folder reader", tool: "glob", input: { path: "/workspace/secrets", pattern: "**" }, covered: true },
  { name: "a shell command naming the folder", tool: "shell_command", input: { command: "cat /workspace/secrets/k" }, covered: true },
  { name: "a tool whose paths the gate cannot read", tool: "structural_search", input: { pattern: "x" }, covered: true },
  { name: "a file beside the folder", tool: "file_read", input: { path: "/workspace/src/a.ts" }, covered: false },
  { name: "a folder whose name starts the same", tool: "file_read", input: { path: "/workspace/secretsX/k" }, covered: false },
];

export interface RefusalCase {
  name: string;
  lists: PathLists;
  layout: HostLayout;
  tool: string;
  input: unknown;
  expected: string | null;
}

const BY_SECRETS = "is refused by paths.deny '/workspace/secrets/*'";
const OWN = "is refused: /user-config is Orkeon Code's own";

export const REFUSAL_CASES: readonly RefusalCase[] = [
  { name: "a file under a denied folder", lists: SECRETS, layout: POSIX, tool: "file_read", input: { path: "/workspace/secrets/k" }, expected: `file_read on '/workspace/secrets/k' ${BY_SECRETS}` },
  { name: "the denied folder itself", lists: SECRETS, layout: POSIX, tool: "directory_search", input: { path: "/workspace/secrets" }, expected: `directory_search on '/workspace/secrets' is refused by paths.deny '/workspace/secrets'` },
  { name: "a file beside the folder", lists: SECRETS, layout: POSIX, tool: "file_read", input: { path: "/workspace/src/a.ts" }, expected: null },
  { name: "a relative path under the folder", lists: SECRETS, layout: POSIX, tool: "file_write", input: { path: "secrets/k", content: "" }, expected: `file_write on 'secrets/k' (/workspace/secrets/k) ${BY_SECRETS}` },
  { name: "a path with steps into the folder", lists: SECRETS, layout: POSIX, tool: "file_read", input: { path: "/workspace/src/../secrets/./k" }, expected: `file_read on '/workspace/src/../secrets/./k' (/workspace/secrets/k) ${BY_SECRETS}` },
  {
    name: "a re-cased drive spelling of the project on native Windows",
    lists: SECRETS, layout: WINDOWS, tool: "file_read", input: { path: "c:/ICI EST/mon REPERTOIRE/Secrets/k" },
    expected: `file_read on 'c:/ICI EST/mon REPERTOIRE/Secrets/k' (/workspace/Secrets/k) ${BY_SECRETS}`,
  },
  { name: "the same drive spelling on a posix host names no mount", lists: SECRETS, layout: POSIX, tool: "file_read", input: { path: "c:/ICI EST/mon REPERTOIRE/Secrets/k" }, expected: null },
  { name: "another case of the virtual path on native Windows", lists: SECRETS, layout: WINDOWS, tool: "file_read", input: { path: "/workspace/Secrets/k" }, expected: `file_read on '/workspace/Secrets/k' ${BY_SECRETS}` },
  { name: "another case of the virtual path on a posix host", lists: SECRETS, layout: POSIX, tool: "file_read", input: { path: "/workspace/Secrets/k" }, expected: null },
  {
    name: "another case under a drive base under WSL",
    lists: SECRETS, layout: WSL, tool: "file_read", input: { path: "/mnt/c/ici est/mon repertoire/SECRETS/k" },
    expected: `file_read on '/mnt/c/ici est/mon repertoire/SECRETS/k' (/workspace/SECRETS/k) ${BY_SECRETS}`,
  },
  { name: "another case under a distribution base under WSL counts", lists: OUTPUT_SECRETS, layout: WSL, tool: "file_read", input: { path: "/output/Secrets/k" }, expected: null },
  { name: "a WSL share spelling of a state mount", lists: OUTPUT_SECRETS, layout: WSL, tool: "file_read", input: { path: "\\\\wsl$\\Ubuntu\\home\\me\\.orkeon-code\\projects\\x\\output\\secrets\\k" }, expected: `file_read on '\\\\wsl$\\Ubuntu\\home\\me\\.orkeon-code\\projects\\x\\output\\secrets\\k' (/output/secrets/k) is refused by paths.deny '/output/secrets/*'` },
  {
    name: "an edit_batch operation under the folder",
    lists: SECRETS, layout: POSIX, tool: "edit_batch", input: { operations: [{ kind: "node_replace", path: "src/a.ts" }, { kind: "node_replace", path: "secrets/k" }] },
    expected: `edit_batch on 'secrets/k' (/workspace/secrets/k) ${BY_SECRETS}`,
  },
  { name: "a glob whose pattern reaches the folder", lists: SECRETS, layout: POSIX, tool: "glob", input: { path: "/workspace", pattern: "secrets/**" }, expected: `glob on '/workspace/secrets/**' ${BY_SECRETS}` },
  { name: "a glob without a path whose pattern reaches the folder", lists: SECRETS, layout: POSIX, tool: "glob", input: { pattern: "secrets/**" }, expected: `glob on 'secrets/**' (/workspace/secrets/**) ${BY_SECRETS}` },
  { name: "a grep over the folder above is let through", lists: SECRETS, layout: POSIX, tool: "grep", input: { path: "/workspace", pattern: "x" }, expected: null },
  { name: "a structural_rewrite naming the folder in its paths", lists: SECRETS, layout: POSIX, tool: "structural_rewrite", input: { paths: ["/workspace/src", "/workspace/secrets"], dry_run: false }, expected: `structural_rewrite on '/workspace/secrets' is refused by paths.deny '/workspace/secrets'` },
  {
    name: "a quoted Windows path with spaces in a shell command",
    lists: SECRETS, layout: WINDOWS, tool: "shell_command", input: { command: `type "${PROJECT_WIN}\\secrets\\k"` },
    expected: `shell_command on '/workspace/secrets/k' ${BY_SECRETS}`,
  },
  {
    name: "an unquoted Windows path with spaces in a shell command, read whole",
    lists: SECRETS, layout: WINDOWS, tool: "shell_command", input: { command: `type ${PROJECT_WIN}\\secrets\\k` },
    expected: `shell_command on '/workspace/secrets/k' ${BY_SECRETS}`,
  },
  { name: "a relative path in a shell command", lists: SECRETS, layout: POSIX, tool: "shell_command", input: { command: "cat secrets/k" }, expected: `shell_command on 'secrets/k' (/workspace/secrets/k) ${BY_SECRETS}` },
  { name: "a path after a step of a shell command", lists: SECRETS, layout: POSIX, tool: "shell_command", input: { command: "cd /workspace && cat secrets/k" }, expected: `shell_command on 'secrets/k' (/workspace/secrets/k) ${BY_SECRETS}` },
  { name: "the value of an assignment in a shell command", lists: SECRETS, layout: POSIX, tool: "shell_command", input: { command: "KEY_FILE=/workspace/secrets/k node x.mjs" }, expected: `shell_command on '/workspace/secrets/k' ${BY_SECRETS}` },
  { name: "the value of an option in a shell command", lists: SECRETS, layout: POSIX, tool: "shell_command", input: { command: "tool --file=secrets/k" }, expected: `shell_command on 'secrets/k' (/workspace/secrets/k) ${BY_SECRETS}` },
  { name: "a shell command without a path", lists: SECRETS, layout: POSIX, tool: "shell_command", input: { command: "echo hello" }, expected: null },
  { name: "a shell command on other paths", lists: SECRETS, layout: POSIX, tool: "shell_command", input: { command: "git -C /workspace status && cat src/a.ts" }, expected: null },
  { name: "a file within the allow list", lists: SRC_ONLY, layout: POSIX, tool: "file_read", input: { path: "/workspace/src/a.ts" }, expected: null },
  { name: "the allowed folder itself", lists: SRC_ONLY, layout: POSIX, tool: "glob", input: { path: "/workspace/src", pattern: "*.ts" }, expected: null },
  { name: "a file outside the allow list", lists: SRC_ONLY, layout: POSIX, tool: "file_read", input: { path: "/workspace/tests/a.ts" }, expected: "file_read on '/workspace/tests/a.ts' is outside paths.allow" },
  { name: "a write on another mount outside the allow list", lists: SRC_ONLY, layout: POSIX, tool: "file_write", input: { path: "/output/x", content: "" }, expected: "file_write on '/output/x' is outside paths.allow" },
  { name: "a folder reader over the folder above the allowed one", lists: SRC_ONLY, layout: POSIX, tool: "grep", input: { path: "/workspace", pattern: "x" }, expected: "grep on '/workspace' is outside paths.allow" },
  { name: "a shell command on a path outside the allow list", lists: SRC_ONLY, layout: POSIX, tool: "shell_command", input: { command: "cat tests/x" }, expected: "shell_command on 'tests/x' (/workspace/tests/x) is outside paths.allow" },
  { name: "a shell command whose paths name no mount is not judged by the allow list", lists: SRC_ONLY, layout: POSIX, tool: "shell_command", input: { command: "npm test 2>/dev/null; /usr/bin/env node -v" }, expected: null },
  { name: "a shell command without a path under an allow list", lists: SRC_ONLY, layout: POSIX, tool: "shell_command", input: { command: "npm run check" }, expected: null },
  { name: "a deny beats the allow list", lists: BOTH, layout: POSIX, tool: "file_read", input: { path: "/workspace/secrets/k" }, expected: `file_read on '/workspace/secrets/k' ${BY_SECRETS}` },
  { name: "a path the allow list of BOTH covers", lists: BOTH, layout: POSIX, tool: "file_read", input: { path: "/workspace/src/a.ts" }, expected: null },
  { name: "the user configuration mount, with no list", lists: EMPTY, layout: POSIX, tool: "file_read", input: { path: "/user-config/launch.json" }, expected: `file_read on '/user-config/launch.json' ${OWN}` },
  { name: "the user configuration mount in its Windows spelling", lists: EMPTY, layout: WINDOWS, tool: "file_read", input: { path: `${STATE_WIN}\\user-config\\launch.json` }, expected: `file_read on '${STATE_WIN}\\user-config\\launch.json' (/user-config/launch.json) ${OWN}` },
  { name: "the user configuration mount for a folder reader", lists: EMPTY, layout: POSIX, tool: "glob", input: { path: "/user-config", pattern: "*" }, expected: `glob on '/user-config' ${OWN}` },
  { name: "the user configuration mount in a shell command", lists: EMPTY, layout: POSIX, tool: "shell_command", input: { command: "cat /user-config/config.json" }, expected: `shell_command on '/user-config/config.json' ${OWN}` },
  { name: "a plain path with no list", lists: EMPTY, layout: POSIX, tool: "file_read", input: { path: "/workspace/x" }, expected: null },
  { name: "a tool that names no path", lists: SRC_ONLY, layout: POSIX, tool: "memory_recall", input: { query: "x" }, expected: null },
  { name: "an input that is not an object", lists: SRC_ONLY, layout: POSIX, tool: "file_read", input: "x", expected: null },
  { name: "the identity host still judges the virtual spelling", lists: SECRETS, layout: IDENTITY_HOST, tool: "file_read", input: { path: "/workspace/secrets/k" }, expected: `file_read on '/workspace/secrets/k' ${BY_SECRETS}` },
];

/** What the built-in /user-config rules cover, by the gate's own reading of them. */
export const USER_CONFIG_COVERAGE: readonly CoverCase[] = [
  { name: "a file of the mount", tool: "file_read", input: { path: "/user-config/launch.json" }, covered: true },
  { name: "a write under the mount", tool: "file_write", input: { path: "/user-config/config.json", content: "" }, covered: true },
  { name: "the mount itself for a folder reader", tool: "glob", input: { path: "/user-config", pattern: "*" }, covered: true },
  { name: "a shell command naming the mount", tool: "shell_command", input: { command: "cat /user-config/launch.json" }, covered: true },
  { name: "a project file", tool: "file_read", input: { path: "/workspace/x" }, covered: false },
  { name: "a shell command on the project", tool: "shell_command", input: { command: "npm test" }, covered: false },
];
