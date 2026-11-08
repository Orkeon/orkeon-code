// Three hosts with all seven mounts, the project on a base with spaces, and the spellings each one maps or keeps.
import { IDENTITY_HOST, type HostLayout } from "../../../src/shared/domain/host-layout.ts";

/** The state mounts beside /workspace, as the launcher mounts them. */
export const STATE_MOUNTS: readonly string[] = ["output", "tmp", "user-config", "sessions", "session-history", "memory"];

const STATE_POSIX = "/home/me/.orkeon-code/projects/x";
const STATE_UNC = "\\\\wsl.localhost\\Ubuntu\\home\\me\\.orkeon-code\\projects\\x";
const STATE_WIN = "C:\\Users\\me\\.orkeon-code\\projects\\x";

export const PROJECT_WIN = "C:\\ici est\\mon repertoire";
export const PROJECT_MNT = "/mnt/c/ici est/mon repertoire";
export const PROJECT_POSIX = "/home/me/projects/x";

/** Orkeon Code started inside a WSL distribution, the project on the Windows disk. */
export const WSL: HostLayout = {
  flavour: "wsl", distro: "Ubuntu", automountRoot: "/mnt",
  mounts: [
    { virtual: "/workspace", posix: PROJECT_MNT, windows: PROJECT_WIN },
    ...STATE_MOUNTS.map((m) => ({ virtual: `/${m}`, posix: `${STATE_POSIX}/${m}`, windows: `${STATE_UNC}\\${m}` })),
  ],
};

/** Native Windows. */
export const WINDOWS: HostLayout = {
  flavour: "windows", automountRoot: "/mnt",
  mounts: [
    { virtual: "/workspace", windows: PROJECT_WIN },
    ...STATE_MOUNTS.map((m) => ({ virtual: `/${m}`, windows: `${STATE_WIN}\\${m}` })),
  ],
};

/** A plain posix host whose launcher wrote its bases. */
export const POSIX: HostLayout = {
  flavour: "posix", automountRoot: "/mnt",
  mounts: [
    { virtual: "/workspace", posix: PROJECT_POSIX },
    ...STATE_MOUNTS.map((m) => ({ virtual: `/${m}`, posix: `${STATE_POSIX}/${m}` })),
  ],
};

export const LAYOUTS: readonly { name: string; layout: HostLayout }[] = [
  { name: "WSL", layout: WSL }, { name: "WINDOWS", layout: WINDOWS }, { name: "POSIX", layout: POSIX },
];

export interface PathCase { name: string; layout: HostLayout; input: string; expected: string }

/** toVirtual: a spelling of a base, mapped. */
export const TO_VIRTUAL_MAPPED: readonly PathCase[] = [
  { name: "WSL, C:\\ with a space in a name", layout: WSL, input: `${PROJECT_WIN}\\un dossier\\f.txt`, expected: "/workspace/un dossier/f.txt" },
  { name: "WSL, C:/ as git for Windows prints it", layout: WSL, input: "C:/ici est/mon repertoire/src/a.ts", expected: "/workspace/src/a.ts" },
  { name: "WSL, the base re-cased", layout: WSL, input: "c:\\Ici Est\\Mon Repertoire\\a", expected: "/workspace/a" },
  { name: "WSL, the \\\\?\\ prefix", layout: WSL, input: `\\\\?\\${PROJECT_WIN}\\a`, expected: "/workspace/a" },
  { name: "WSL, /mnt/c", layout: WSL, input: `${PROJECT_MNT}/a`, expected: "/workspace/a" },
  { name: "WSL, /mnt/C upper-cased", layout: WSL, input: "/mnt/C/ici est/mon repertoire/a", expected: "/workspace/a" },
  { name: "WSL, \\\\wsl$\\ of a state folder", layout: WSL, input: "\\\\wsl$\\Ubuntu\\home\\me\\.orkeon-code\\projects\\x\\output\\jobs\\1.log", expected: "/output/jobs/1.log" },
  { name: "WSL, \\\\wsl.localhost\\ with the distro re-cased", layout: WSL, input: "\\\\wsl.localhost\\ubuntu\\home\\me\\.orkeon-code\\projects\\x\\output\\a", expected: "/output/a" },
  { name: "WSL, a posix state folder", layout: WSL, input: `${STATE_POSIX}/memory/entries`, expected: "/memory/entries" },
  { name: "WSL, a trailing \\", layout: WSL, input: `${PROJECT_WIN}\\`, expected: "/workspace" },
  { name: "WSL, a trailing /", layout: WSL, input: `${PROJECT_MNT}/`, expected: "/workspace" },
  { name: "WSL, doubled \\\\", layout: WSL, input: "C:\\\\ici est\\\\mon repertoire\\\\a", expected: "/workspace/a" },
  { name: "WSL, the base alone", layout: WSL, input: PROJECT_WIN, expected: "/workspace" },
  { name: "WSL, a virtual path with \\ after the mount", layout: WSL, input: "/workspace/un dossier\\f.txt", expected: "/workspace/un dossier/f.txt" },
  { name: "WSL, a virtual path with a trailing /", layout: WSL, input: "/output/jobs/", expected: "/output/jobs" },
  ...STATE_MOUNTS.map((m) => ({ name: `WSL, the UNC root of /${m}`, layout: WSL, input: `${STATE_UNC}\\${m}`, expected: `/${m}` })),
  ...STATE_MOUNTS.map((m) => ({ name: `WSL, the posix root of /${m}`, layout: WSL, input: `${STATE_POSIX}/${m}`, expected: `/${m}` })),
  { name: "WINDOWS, a file", layout: WINDOWS, input: `${PROJECT_WIN}\\a\\b.ts`, expected: "/workspace/a/b.ts" },
  { name: "WINDOWS, re-cased with /", layout: WINDOWS, input: "c:/ICI EST/mon repertoire", expected: "/workspace" },
  { name: "WINDOWS, a state folder", layout: WINDOWS, input: `${STATE_WIN}\\output\\a`, expected: "/output/a" },
  ...STATE_MOUNTS.map((m) => ({ name: `WINDOWS, the root of /${m}`, layout: WINDOWS, input: `${STATE_WIN}\\${m}`, expected: `/${m}` })),
  { name: "POSIX, a file of the project", layout: POSIX, input: `${PROJECT_POSIX}/src/a.ts`, expected: "/workspace/src/a.ts" },
  { name: "POSIX, a state folder", layout: POSIX, input: `${STATE_POSIX}/output/a`, expected: "/output/a" },
  { name: "POSIX, a \\ in a name is a character of the name", layout: POSIX, input: `${PROJECT_POSIX}/a\\b`, expected: "/workspace/a\\b" },
  ...STATE_MOUNTS.map((m) => ({ name: `POSIX, the root of /${m}`, layout: POSIX, input: `${STATE_POSIX}/${m}`, expected: `/${m}` })),
];

export interface KeptCase { name: string; layout: HostLayout; input: string }

/** toVirtual keeps these as written. */
export const TO_VIRTUAL_KEPT: readonly KeptCase[] = [
  { name: "WSL, .. inside", layout: WSL, input: `${PROJECT_WIN}\\..\\x` },
  { name: "WSL, . inside", layout: WSL, input: `${PROJECT_WIN}\\.\\x` },
  { name: "WSL, a relative path with \\", layout: WSL, input: "src\\a.ts" },
  { name: "WSL, a relative path", layout: WSL, input: "src/a.ts" },
  { name: "WSL, a look-alike mount", layout: WSL, input: "/workspaces/x" },
  { name: "WSL, a folder whose name starts with the base's last name", layout: WSL, input: `${PROJECT_WIN}X\\a` },
  { name: "WSL, a parent of the base", layout: WSL, input: "C:\\ici est" },
  { name: "WSL, another drive", layout: WSL, input: "D:\\ici est\\mon repertoire\\a" },
  { name: "WSL, another distro", layout: WSL, input: "\\\\wsl$\\Debian\\home\\me\\.orkeon-code\\projects\\x\\output\\a" },
  { name: "WSL, a drive-relative path", layout: WSL, input: "C:foo" },
  { name: "WSL, an environment variable", layout: WSL, input: "%USERPROFILE%\\x" },
  { name: "WSL, a home shortcut", layout: WSL, input: "~/x" },
  { name: "WSL, a file URL", layout: WSL, input: "file:///C:/ici%20est/mon%20repertoire/a" },
  { name: "WSL, a canonical virtual path", layout: WSL, input: "/workspace/un dossier/f.txt" },
  { name: "WINDOWS, /mnt/c", layout: WINDOWS, input: `${PROJECT_MNT}/a` },
  { name: "POSIX, /mnt/c", layout: POSIX, input: `${PROJECT_MNT}/a` },
  { name: "POSIX, C:\\", layout: POSIX, input: `${PROJECT_WIN}\\a` },
  { name: "POSIX, the base re-cased", layout: POSIX, input: "/home/me/projects/X/a" },
  { name: "POSIX, .. inside", layout: POSIX, input: `${PROJECT_POSIX}/../y` },
  { name: "IDENTITY, C:\\", layout: IDENTITY_HOST, input: `${PROJECT_WIN}\\a` },
  { name: "IDENTITY, /mnt/c", layout: IDENTITY_HOST, input: `${PROJECT_MNT}/a` },
  { name: "IDENTITY, a virtual path with \\", layout: IDENTITY_HOST, input: "/workspace/un dossier\\f.txt" },
];

export interface FromVirtualCase { name: string; layout: HostLayout; path: string; spelling: "posix" | "windows"; expected: string | null }

export const FROM_VIRTUAL: readonly FromVirtualCase[] = [
  { name: "WSL, a file in Windows spelling", layout: WSL, path: "/workspace/un dossier/f.txt", spelling: "windows", expected: `${PROJECT_WIN}\\un dossier\\f.txt` },
  { name: "WSL, a file in posix spelling", layout: WSL, path: "/workspace/un dossier/f.txt", spelling: "posix", expected: `${PROJECT_MNT}/un dossier/f.txt` },
  { name: "WSL, the mount alone", layout: WSL, path: "/workspace", spelling: "windows", expected: PROJECT_WIN },
  { name: "WSL, a state folder in Windows spelling", layout: WSL, path: "/output/a", spelling: "windows", expected: `${STATE_UNC}\\output\\a` },
  { name: "WINDOWS, no posix spelling", layout: WINDOWS, path: "/workspace/a", spelling: "posix", expected: null },
  { name: "WINDOWS, under no mount", layout: WINDOWS, path: "/nowhere/a", spelling: "windows", expected: null },
  { name: "WINDOWS, a relative path", layout: WINDOWS, path: "src/a", spelling: "windows", expected: null },
  { name: "IDENTITY, no mount", layout: IDENTITY_HOST, path: "/workspace/a", spelling: "posix", expected: null },
];

/** The virtual paths the round trip is checked on, for every mount of every layout, in each spelling the mount has. */
export const ROUND_TRIPS: readonly { name: string; layout: HostLayout; path: string; spelling: "posix" | "windows" }[] = LAYOUTS.flatMap(({ name, layout }) =>
  layout.mounts.flatMap((mount) =>
    (["posix", "windows"] as const).filter((s) => mount[s] !== undefined).flatMap((spelling) =>
      [mount.virtual, `${mount.virtual}/un dossier/f.txt`].map((path) => ({ name: `${name}, ${path} as ${spelling}`, layout, path, spelling })))));

export interface TextCase { name: string; layout: HostLayout; input: string; expected: string; keepFenced?: boolean }

export const TEXT_TO_VIRTUAL: readonly TextCase[] = [
  { name: "a quoted path with spaces", layout: WSL, input: `error: cannot open "${PROJECT_WIN}\\un dossier\\f.txt"`, expected: 'error: cannot open "/workspace/un dossier/f.txt"' },
  { name: "a single-quoted path with spaces", layout: WSL, input: `open '${PROJECT_MNT}/un dossier/f.txt' failed`, expected: "open '/workspace/un dossier/f.txt' failed" },
  { name: "an unquoted path with a space, the next word holding a \\", layout: WSL, input: `${PROJECT_WIN}\\un dossier\\f.txt not found`, expected: "/workspace/un dossier/f.txt not found" },
  { name: "an unquoted path cut at a space, the rest kept", layout: WSL, input: `in ${PROJECT_WIN}\\un dossier and more`, expected: "in /workspace/un dossier and more" },
  { name: "a line:column after the path", layout: WSL, input: `${PROJECT_WIN}\\src\\f.ts:12:5 - error TS2304`, expected: "/workspace/src/f.ts:12:5 - error TS2304" },
  { name: "a path in parentheses", layout: WSL, input: `(${PROJECT_WIN}\\a)`, expected: "(/workspace/a)" },
  { name: "a comma list", layout: WSL, input: `${PROJECT_WIN}\\a, ${PROJECT_WIN}\\b`, expected: "/workspace/a, /workspace/b" },
  { name: "a dot that ends the sentence", layout: WSL, input: `see ${PROJECT_WIN}\\a.`, expected: "see /workspace/a." },
  { name: "two spellings on one line", layout: WSL, input: `from ${PROJECT_WIN}\\a to ${PROJECT_MNT}/b`, expected: "from /workspace/a to /workspace/b" },
  { name: "two Windows paths on one line", layout: WSL, input: `copy ${PROJECT_WIN}\\a to ${PROJECT_WIN}\\b`, expected: "copy /workspace/a to /workspace/b" },
  { name: "a Windows path then a UNC path", layout: WSL, input: `${PROJECT_WIN}\\a \\\\wsl$\\Ubuntu\\home\\me\\.orkeon-code\\projects\\x\\output\\b`, expected: "/workspace/a /output/b" },
  { name: "a name with several spaces, ended by a sentence dot", layout: WSL, input: `see ${PROJECT_WIN}\\Documents and Settings\\x.`, expected: "see /workspace/Documents and Settings/x." },
  { name: "C:/ as git for Windows prints it", layout: WSL, input: "C:/ici est/mon repertoire", expected: "/workspace" },
  { name: "a \\\\wsl.localhost\\ path", layout: WSL, input: "log: \\\\wsl.localhost\\Ubuntu\\home\\me\\.orkeon-code\\projects\\x\\output\\jobs\\1.log", expected: "log: /output/jobs/1.log" },
  { name: "the runtime's own cut output, a virtual path with \\", layout: WSL, input: "/workspace/un dossier\\f.txt", expected: "/workspace/un dossier/f.txt" },
  { name: "a sibling folder whose name starts like the base", layout: WSL, input: `${PROJECT_WIN} de travail\\x`, expected: `${PROJECT_WIN} de travail\\x` },
  { name: "a fenced block kept when asked", layout: WSL, input: `\`\`\`\n${PROJECT_WIN}\\a\n\`\`\`\n${PROJECT_WIN}\\b`, expected: `\`\`\`\n${PROJECT_WIN}\\a\n\`\`\`\n/workspace/b`, keepFenced: true },
  { name: "a fenced block converted by default", layout: WSL, input: `\`\`\`\n${PROJECT_WIN}\\a\n\`\`\``, expected: "```\n/workspace/a\n```" },
  { name: "WINDOWS, re-cased", layout: WINDOWS, input: `c:\\ICI EST\\mon repertoire\\a`, expected: "/workspace/a" },
  { name: "WINDOWS, dir's header", layout: WINDOWS, input: ` Directory of ${PROJECT_WIN}\\un dossier`, expected: " Directory of /workspace/un dossier" },
  { name: "POSIX, the real base", layout: POSIX, input: `${PROJECT_POSIX}/src/a.ts`, expected: "/workspace/src/a.ts" },
  { name: "POSIX, a look-alike base kept", layout: POSIX, input: "/home/me/projects/xy/a", expected: "/home/me/projects/xy/a" },
  { name: "POSIX, a canonical path kept", layout: POSIX, input: "/workspace/a", expected: "/workspace/a" },
  { name: "IDENTITY, nothing", layout: IDENTITY_HOST, input: `${PROJECT_WIN}\\a`, expected: `${PROJECT_WIN}\\a` },
  { name: "an empty text", layout: WSL, input: "", expected: "" },
];

export const COMMAND_TO_VIRTUAL: readonly PathCase[] = [
  { name: "a double-quoted Windows path", layout: WSL, input: `type "${PROJECT_WIN}\\un dossier\\f.txt"`, expected: 'type "/workspace/un dossier/f.txt"' },
  { name: "a single-quoted /mnt path", layout: WSL, input: `cat '${PROJECT_MNT}/a'`, expected: "cat '/workspace/a'" },
  { name: "a key=path word", layout: WSL, input: `node x.js --log=${STATE_POSIX}/output/a.log`, expected: "node x.js --log=/output/a.log" },
  { name: "an unquoted path with a space, split by the shell: kept", layout: WSL, input: `git -C ${PROJECT_MNT} status`, expected: `git -C ${PROJECT_MNT} status` },
  { name: "WINDOWS, an unquoted path without a space", layout: WINDOWS, input: `dir ${STATE_WIN}\\output`, expected: "dir /output" },
  { name: "POSIX, the real base", layout: POSIX, input: `cat ${PROJECT_POSIX}/a`, expected: "cat /workspace/a" },
  { name: "a path inside a script word: kept", layout: WSL, input: `node -e "fs.readFileSync('${PROJECT_MNT}/a')"`, expected: `node -e "fs.readFileSync('${PROJECT_MNT}/a')"` },
  { name: "IDENTITY, unchanged", layout: IDENTITY_HOST, input: `cat ${PROJECT_MNT}/a`, expected: `cat ${PROJECT_MNT}/a` },
  { name: "an empty command", layout: WSL, input: "", expected: "" },
];

/** Commands whose words commandTokens and shellWords must agree on. */
export const TOKEN_COMMANDS: readonly string[] = [
  'git "push" origin', "echo 'a b'  c", 'x="a b"c d', "  lead and trail  ", "a\tb", "", `type "${PROJECT_WIN}\\a b"`, "it's 'a'",
];

export interface CallCase { name: string; tool: string; input: unknown; layout: HostLayout; expected: Record<string, unknown> | null }

export const CALL_TO_VIRTUAL: readonly CallCase[] = [
  { name: "file_read path", tool: "file_read", input: { path: `${PROJECT_WIN}\\a` }, layout: WSL, expected: { path: "/workspace/a" } },
  { name: "glob root_path, pattern kept", tool: "glob", input: { root_path: `${PROJECT_MNT}/src`, pattern: "**/*.ts" }, layout: WSL, expected: { root_path: "/workspace/src", pattern: "**/*.ts" } },
  { name: "shell_command working_directory and command", tool: "shell_command", input: { command: `cat "${PROJECT_WIN}\\a"`, working_directory: PROJECT_WIN }, layout: WSL, expected: { command: 'cat "/workspace/a"', working_directory: "/workspace" } },
  { name: "paths list", tool: "file_read_many", input: { paths: [`${PROJECT_WIN}\\a`, "src/b", 3] }, layout: WSL, expected: { paths: ["/workspace/a", "src/b", 3] } },
  { name: "edit_batch operations, content kept", tool: "edit_batch", input: { operations: [{ path: `${PROJECT_WIN}\\a`, content: `${PROJECT_WIN}\\b` }, { op: "x" }] }, layout: WSL, expected: { operations: [{ path: "/workspace/a", content: `${PROJECT_WIN}\\b` }, { op: "x" }] } },
  { name: "file_write content and old_string kept", tool: "file_write", input: { path: "/workspace/a", content: `${PROJECT_WIN}\\b`, old_string: `${PROJECT_MNT}/c` }, layout: WSL, expected: null },
  { name: "command of another tool kept", tool: "run_tests", input: { command: `cat ${PROJECT_MNT}/a` }, layout: WSL, expected: null },
  { name: "nothing to change", tool: "file_read", input: { path: "/workspace/a" }, layout: WSL, expected: null },
  { name: "not an object", tool: "file_read", input: "x", layout: WSL, expected: null },
  { name: "IDENTITY", tool: "file_read", input: { path: `${PROJECT_WIN}\\a` }, layout: IDENTITY_HOST, expected: null },
];
