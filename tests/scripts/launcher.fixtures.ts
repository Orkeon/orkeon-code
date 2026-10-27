// The launchers' tests run: a scratch checkout holding a copy of each launcher, stand-ins on PATH that record how they
// were started, the trust store and the session scenes they start on, and the snippets the PowerShell twin is read for.
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { WORKSPACE } from "../../src/shared/domain/vfs.ts";

/** A file of the repository, read as text. */
export const read = (name: string) => readFileSync(fileURLToPath(new URL(`../../${name}`, import.meta.url)), "utf-8");
export const GATE = "Orkeon__Security__PermissionGate__Enabled";
export const START_SCRIPT = "Orkeon__Cli__Session__StartScript";
export const PERSIST = "Orkeon__Cli__Session__Persist";
export const SESSIONS_DIR = "ORKEON_Orkeon__Cli__Session__SessionsDirectory";

/** A snippet a launcher must hold, and what it is for. */
export type Mention = readonly [snippet: string, why: string];

// ── Scratch folders ─────────────────────────────────────────────────────────

const scratch: string[] = [];

/** Removes every scratch folder the tests made: the test file calls it once, after them all. */
export function removeScratch(): void {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
}

export function scratchDir(prefix: string): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  scratch.push(dir);
  return dir;
}

/** A folder `dir` made outside a scratch folder, removed with them. */
export function scratchFolder(dir: string): string {
  mkdirSync(dir);
  scratch.push(dir);
  return dir;
}

// ── The stand-ins ───────────────────────────────────────────────────────────

/** A stand-in that records how it was started, then exits 0. `extra` goes before the recording. */
export function recorder(extra = ""): string {
  return `#!/bin/sh\n${extra}pwd > "$RECORD/cwd"\nprintf '%s\\n' "$@" > "$RECORD/args"\nenv > "$RECORD/env"\n`;
}

/** The Debian package's /usr/bin/orkeon-repl, as scripts/package-deb.sh writes it, recording instead of exec. */
export const DEB_WRAPPER = recorder(
  'ORKEON_HOME=/usr/lib/orkeon\nif [ -z "${ORKEON_ESBUILD_PATH:-}" ] && [ -x "$ORKEON_HOME/esbuild-bin/esbuild" ]; then\n' +
    '  ORKEON_ESBUILD_PATH="$ORKEON_HOME/esbuild-bin/esbuild"\n  export ORKEON_ESBUILD_PATH\nfi\n',
);

/** dotnet: every call lands in `calls` as `<cwd> <args>`; a build succeeds unless DOTNET_BUILD_FAILS is set, and
 *  any other call (the REPL's assembly) is recorded like the other stand-ins. */
export const DOTNET = recorder(
  'echo "$(pwd) $*" >> "$RECORD/calls"\n' +
    'if [ "$1" = build ]; then if [ -n "${DOTNET_BUILD_FAILS:-}" ]; then exit 1; fi; exit 0; fi\n',
);

/** Where a source-mode build leaves the REPL, under the Orkeon checkout. */
export const CONSOLE_APP_DLL = "src/apps/Orkeon.ConsoleApp/bin/Debug/net10.0/Orkeon.ConsoleApp.dll";

/** An Orkeon checkout as the source mode reads it, its REPL already built. */
export function orkeonCheckout(): string {
  const source = scratchDir("orkeon-code-source-");
  mkdirSync(join(source, CONSOLE_APP_DLL, ".."), { recursive: true });
  writeFileSync(join(source, CONSOLE_APP_DLL), "");
  return source;
}

/** What source mode runs, in order: the build in the Orkeon checkout, then the assembly from the project. */
export const sourceModeCalls = (source: string, r: Run) => [
  `${source} build src/apps/Orkeon.ConsoleApp -c Debug --no-restore -nologo -v quiet`,
  `${r.project} ${join(source, CONSOLE_APP_DLL)} ${r.args.slice(1).join(" ")}`,
];

/** A project file that pins an SDK the machine may not have: no SDK command may run there. */
export const PINNED_SDK = { "global.json": JSON.stringify({ sdk: { version: "8.0.100", rollForward: "disable" } }) };

// ── A launch ────────────────────────────────────────────────────────────────

export interface Run {
  status: number | null; stdout: string; stderr: string; cwd: string; args: string[]; env: Map<string, string>; calls: string[];
  root: string; project: string; state: string;
}

/** pwsh, when installed: the PowerShell twin is then run as well. */
export const PWSH = spawnSync("sh", ["-c", "command -v pwsh"], { encoding: "utf-8" }).stdout.trim();

/** util-linux `script`, which gives the launcher a pseudo-terminal; the prompt cases are Linux-only. */
export const PTY = process.platform === "linux" && spawnSync("sh", ["-c", "script --version"], { encoding: "utf-8" }).stdout.includes("util-linux");

export interface LaunchOptions {
  args: string[]; bin: Record<string, string>; env?: Record<string, string>; projectFiles?: Record<string, string>;
  settings?: Record<string, unknown>; shell?: "bash" | "pwsh";
  /** An install (no `.git` beside the launcher) rather than a clone (the default). */
  install?: boolean;
  /** No --settings, --workspace nor ORKEON_CODE_STATE: the launcher's own defaults apply, from the project. */
  bare?: boolean;
  /** More files, by path under the scratch folder (beside `bin/`, `checkout/`, `project/`). */
  files?: Record<string, string>;
  /** false: the scratch folder is not in the trust store (by default it is, so the start is silent). */
  trusted?: boolean;
  /** Runs the launcher on a pseudo-terminal (`script`), these lines typed on it. */
  tty?: string;
}

/** Runs a copy of ./orkeon-code (or of ./orkeon-code.ps1, `shell: "pwsh"`, whose `args` are its own) with the given
 *  stand-ins on PATH, on a project holding `projectFiles`. */
export function launch(opts: LaunchOptions): Run {
  const base = scratchDir("orkeon-code-launcher-");
  const root = join(base, "checkout");
  const bin = join(base, "bin");
  const project = join(base, "project");
  const state = join(base, "state");
  const record = join(base, "record");
  for (const dir of [root, bin, project, record, join(root, "scripts")]) mkdirSync(dir, { recursive: true });
  for (const [name, content] of Object.entries(opts.projectFiles ?? {})) writeFileSync(join(project, name), content);
  for (const file of ["orkeon-code", "orkeon-code.ps1", ".orkeon-version", "package.json", "scripts/setup-fixture.sh", "scripts/session-start.ork.ts"]) {
    copyFileSync(fileURLToPath(new URL(`../../${file}`, import.meta.url)), join(root, file));
  }
  if (!opts.install) mkdirSync(join(root, ".git"));
  for (const [name, content] of Object.entries(opts.files ?? {})) {
    mkdirSync(join(base, name, ".."), { recursive: true });
    writeFileSync(join(base, name), content);
  }
  if (opts.trusted !== false) {
    const codeHome = opts.env?.ORKEON_CODE_HOME ?? join(base, ".orkeon-code");
    mkdirSync(codeHome, { recursive: true });
    writeFileSync(join(codeHome, "trusted-folders.json"), trustStore([base]));
  }
  const settings = join(base, "settings.json");
  writeFileSync(settings, JSON.stringify(opts.settings ?? { Llm: { Model: "m", BaseUrl: "http://127.0.0.1:9/v1" } }));
  for (const [name, body] of Object.entries(opts.bin)) {
    writeFileSync(join(bin, name), body);
    chmodSync(join(bin, name), 0o755);
  }
  const given = opts.bare ? []
    : opts.shell === "pwsh" ? ["-Settings", settings, "-Workspace", project] : ["--settings", settings, "--workspace", project];
  const [command, args] = opts.shell === "pwsh"
    ? [PWSH, ["-NoProfile", "-File", join(root, "orkeon-code.ps1"), ...given, ...opts.args]]
    : ["bash", [join(root, "orkeon-code"), ...given, ...opts.args]];
  const [file, argv] = opts.tty === undefined ? [command, args] : ["script", ["-qec", [command, ...args].map(shq).join(" "), "/dev/null"]];
  const run = spawnSync(file, argv, {
    cwd: opts.bare ? project : base,
    encoding: "utf-8",
    input: opts.tty,
    env: {
      PATH: `${bin}:/usr/bin:/bin`, HOME: base, ...(opts.bare ? {} : { ORKEON_CODE_STATE: state }), RECORD: record, ...opts.env,
    },
  });
  const recorded = (name: string) => { try { return readFileSync(join(record, name), "utf-8"); } catch { return ""; } };
  const env = new Map(recorded("env").split("\n").filter((l) => l.includes("=")).map((l) => {
    const eq = l.indexOf("=");
    return [l.slice(0, eq), l.slice(eq + 1)] as [string, string];
  }));
  return {
    status: run.status, stdout: run.stdout, stderr: run.stderr, cwd: recorded("cwd").trim(),
    args: recorded("args").split("\n").slice(0, -1), env, calls: recorded("calls").split("\n").slice(0, -1),
    root, project, state,
  };
}

/** A word for sh -c, quoted. */
const shq = (word: string) => `'${word.replace(/'/g, "'\\''")}'`;

/** A trust store in the launchers' layout, every folder trusted on the same date. */
export function trustStore(folders: string[]): string {
  const lines = folders.map((f) => `    { "path": ${JSON.stringify(f)}, "trustedAt": "2026-10-24T00:00:00Z" }`);
  return `{\n  "version": 1,\n  "folders": [\n${lines.join(",\n")}\n  ]\n}\n`;
}

/** The virtual roots of the --mount arguments. */
export const mountRoots = (args: string[]) =>
  args.flatMap((a, i) => (args[i - 1] === "--mount" ? [a.split(":")[1]] : []));

/** The roots the runtime keeps for itself: no launcher mounts one. */
export const RESERVED = /^\/(sandbox|credentials|llm-logs|cli-commands|crews)/;

/** The roots every start mounts, in order. */
export const ROOTS = [WORKSPACE, "/output", "/tmp", "/user-config", "/sessions", "/session-history"];

/** The runtime's ProjectKey.Slug (Orkeon.Infrastructure/Session/ProjectKey.cs), pinned below to values the runtime
 *  computed: the last segment, each UTF-16 unit an ASCII letter or digit lowercased, else '-', then '-' and the first
 *  12 hex of the SHA-256 of the whole path in UTF-8. */
export function slugOf(key: string): string {
  const name = key.replace(/[/\\]+$/, "").split(/[/\\]/).pop()!;
  let out = "";
  for (let i = 0; i < name.length; i++) out += /[A-Za-z0-9]/.test(name[i]) ? name[i].toLowerCase() : "-";
  return `${out}-${createHash("sha256").update(key, "utf8").digest("hex").slice(0, 12)}`;
}

/** Where a launch with ORKEON_CODE_STATE keeps the project's own part. */
export const projectState = (r: Run) => join(r.state, "projects", slugOf(r.project));

/** The arguments tool mode hands the REPL, on a launch with --settings, --workspace and ORKEON_CODE_STATE. */
export const toolModeArgs = (r: Run) => [
  "--runner=scripted-commands", "--commands-dir", join(r.root, "src/commands"), "--crews-dir", join(r.root, "src/crews"),
  "--settings", join(r.root, "..", "settings.json"),
  "--mount", `${r.project}:${WORKSPACE}:rw`, "--mount", `${r.state}/output:/output:rw`, "--mount", `${r.state}/tmp:/tmp:rw`,
  "--mount", `${r.state}/user-config:/user-config:ro`,
  "--mount", `${projectState(r)}/sessions:/sessions:rw`, "--mount", `${projectState(r)}/history:/session-history:ro`,
];

/** The --mount argument of a read-write `root`. */
export const mountOf = (r: Run, root: string) => r.args.find((a, i) => r.args[i - 1] === "--mount" && a.endsWith(`:${root}:rw`));

// ── Common starts ───────────────────────────────────────────────────────────

export const ESBUILD = { ORKEON_ESBUILD_PATH: "/opt/esbuild" };
export const TOOL_REPL = { "orkeon-repl": recorder() };
export const TOOL_START = { args: ["--mode", "tool"], bin: TOOL_REPL, env: ESBUILD };
export const CODE_VERSION = JSON.parse(read("package.json")).version as string;
export const RUNTIME_VERSION = read(".orkeon-version").trim();
export const SETTINGS_TEXT = JSON.stringify({ Llm: { Model: "m", BaseUrl: "http://127.0.0.1:9/v1" } });
/** The user's settings file the launchers read today, under the scratch HOME. */
export const USER_SETTINGS = { ".config/orkeon-code/appsettings.json": SETTINGS_TEXT };
/** An Orkeon archive install's VERSION, beside orkeon-repl. */
export const ARCHIVE_VERSION = { VERSION: "1.0.0-rc.6\n" };
export const RUNTIME_SETTINGS_TEXT = JSON.stringify({ Llm: { Model: "m", BaseUrl: "http://127.0.0.1:9/v1", ApiKeyEnvVar: "RUNTIME_KEY" } });
/** Orkeon's own settings file, under the scratch HOME. */
export const RUNTIME_SETTINGS = { ".config/Orkeon/appsettings.json": RUNTIME_SETTINGS_TEXT };

// ── Speech-to-text ──────────────────────────────────────────────────────────

export const SPEECH_TOOL = { "orkeon-repl": recorder(), uv: "#!/bin/sh\n" };
export const WHISPER = "ORKEON_MCP__Servers__whisper__";
export const whisperEnv = (r: Run) => [...r.env.keys()].filter((k) => k.startsWith(WHISPER) || k.startsWith("WHISPER_")).sort();

/** A tool-mode environment that turns speech-to-text on, on `audio`, with `extra` variables. */
export const audioEnv = (audio: string, extra: Record<string, string> = {}) =>
  ({ ...ESBUILD, ORKEON_CODE_AUDIO_DIR: audio, ...extra });

/** The server's arguments ORKEON_MCP__Servers__whisper__Args__<i> holds, for each index of `indices`. */
export const whisperArgs = (r: Run, indices: number[]) => indices.map((i) => r.env.get(`${WHISPER}Args__${i}`));

/** The indices 0 to `count` - 1. */
export const upTo = (count: number) => Array.from({ length: count }, (_, i) => i);

/** How the server is started: uv run on the checkout's project, these extras, then the script. */
export const serverArgs = (root: string, extras: string[]) =>
  ["run", "--project", join(root, "mcp/whisper"), ...extras.flatMap((e) => ["--extra", e]), join(root, "mcp/whisper/whisper_mcp.py")];

/** What the REPL gets of the server: its arguments, the checkout's path made relative, and the WHISPER_ switches. */
export const serverOf = (r: Run) => ({
  args: [...r.env].filter(([k]) => k.startsWith(`${WHISPER}Args__`))
    .sort(([a], [b]) => Number(a.split("__").pop()) - Number(b.split("__").pop())).map(([, v]) => v.replace(r.root, "<root>")),
  switches: [...r.env].filter(([k]) => /^WHISPER_(MICROPHONE|SPEAKER)$/.test(k)).map(([k, v]) => `${k}=${v}`).sort(),
});

/** The speech switches the PowerShell twin is run on beside ./orkeon-code, each named by what it turns on. */
export const SERVER_CASES: readonly { name: string; extra: Record<string, string> }[] = [
  { name: "speech-to-text alone", extra: {} },
  { name: "the microphone and the speaker", extra: { ORKEON_CODE_VOICE: "1" } },
  { name: "the microphone and the speaker with another speech backend", extra: { ORKEON_CODE_VOICE: "1", TTS_BACKEND: "http" } },
  { name: "OpenAI's speech on the GPU, case and spaces aside", extra: { TTS_BACKEND: " OpenAI", WHISPER_DEVICE: "CUDA" } },
  { name: "OpenAI's transcription on the GPU, with the microphone", extra: { ORKEON_CODE_VOICE: "1", WHISPER_BACKEND: "openai", WHISPER_DEVICE: "cuda" } },
  { name: "a voice switch that is not 1, with Piper", extra: { ORKEON_CODE_VOICE: "true", TTS_BACKEND: "Piper" } },
];

/** The reasons both launchers leave the server out, and the words they say it in. */
export const SERVER_LEFT_OUT: readonly {
  name: string; mode: string; said: string; opts: (env: Record<string, string>) => Omit<LaunchOptions, "shell" | "args">;
}[] = [
  { name: "no uv", mode: "tool", opts: (env) => ({ bin: { "orkeon-repl": recorder() }, env }), said: "uv is not on PATH: speech-to-text is off" },
  {
    name: "settings file, any case", mode: "tool",
    opts: (env) => ({ bin: SPEECH_TOOL, env, settings: { Llm: { Model: "m" }, MCP: { Servers: { Whisper: { Command: "/opt/uv" } } } } }),
    said: 'declares a "whisper" MCP server: ORKEON_CODE_AUDIO_DIR is ignored',
  },
  {
    name: "environment", mode: "tool", opts: (env) => ({ bin: SPEECH_TOOL, env: { ...env, [`${WHISPER}Url`]: "http://host.docker.internal:8765/mcp" } }),
    said: 'the environment declares a "whisper" MCP server (ORKEON_MCP__Servers__whisper__*)',
  },
  { name: "docker", mode: "docker", opts: (env) => ({ bin: { docker: recorder(), uv: "#!/bin/sh\n" }, env }), said: "ORKEON_CODE_AUDIO_DIR is ignored in docker mode" },
];

/** The variables orkeon-code.ps1 is run to put back: unset before the start, but WHISPER_SPEAKER. */
export const RESTORED_NAMES = ["WHISPER_AUDIO_DIR", "WHISPER_MICROPHONE", "WHISPER_SPEAKER", `${WHISPER}Command`, `${WHISPER}Args__0`, `${WHISPER}Args__6`];

/** Runs orkeon-code.ps1 inside a pwsh session with voice on and WHISPER_SPEAKER set, then prints, for each of `names`,
 *  `<name>=<set>=<value>` as the session sees it afterwards. */
export function runPs1ThenPrint(names: string[]) {
  const audio = scratchDir("orkeon-code-audio-");
  const base = scratchDir("orkeon-code-restore-");
  const bin = join(base, "bin");
  mkdirSync(bin);
  for (const [name, body] of Object.entries(SPEECH_TOOL)) { writeFileSync(join(bin, name), body); chmodSync(join(bin, name), 0o755); }
  const settings = join(base, "settings.json");
  writeFileSync(settings, JSON.stringify({ Llm: { Model: "m" } }));
  const script = fileURLToPath(new URL("../../orkeon-code.ps1", import.meta.url));
  return spawnSync(PWSH, ["-NoProfile", "-Command",
    `& '${script}' -Mode tool -Settings '${settings}' -Workspace '${base}' -Trust *> $null; ` +
    `foreach ($n in @(${names.map((n) => `'${n}'`).join(", ")})) { "$n=$(Test-Path "env:$n")=$([Environment]::GetEnvironmentVariable($n))" }`], {
    cwd: base, encoding: "utf-8",
    env: { PATH: `${bin}:/usr/bin:/bin`, HOME: base, ORKEON_CODE_STATE: join(base, "state"), RECORD: base, ORKEON_ESBUILD_PATH: "/opt/esbuild",
           ORKEON_CODE_AUDIO_DIR: audio, ORKEON_CODE_VOICE: "1", WHISPER_SPEAKER: "kept" },
  });
}

// ── The user settings ───────────────────────────────────────────────────────

/** node reads the block: a stand-in on PATH that runs this test's node, wherever it is installed. */
const NODE = { node: `#!/bin/sh\nexec "${process.execPath}" "$@"\n` };
export const BLOCK = { "permissions.fallback": "acceptEdits", "tools.extra": "search_issues:read" };
export const SETTINGS_WITH_BLOCK = { Llm: { Model: "m", BaseUrl: "http://127.0.0.1:9/v1", ApiKey: "never-copied" }, orkeonCode: BLOCK };
export const userFile = (r: Run) => join(r.state, "user-config", "config.json");
export const launchWithNode = (o: LaunchOptions) => launch({ ...o, bin: { ...o.bin, ...NODE } });

/** The stand-ins and the environment each mode starts with. */
export function modeStart(mode: "tool" | "source" | "docker"): { bin: Record<string, string>; env: Record<string, string> } {
  const env: Record<string, string> = { ...ESBUILD };
  if (mode === "source") env.ORKEON_SOURCE = orkeonCheckout();
  const bin: Record<string, string> = { tool: { "orkeon-repl": recorder() }, source: { dotnet: DOTNET }, docker: { docker: recorder() } }[mode];
  return { bin, env };
}

/** Settings whose block yields no file. */
export const NO_FILE_SETTINGS: readonly { name: string; settings: Record<string, unknown> }[] = [
  { name: "a block that is not an object", settings: { ...SETTINGS_WITH_BLOCK, orkeonCode: [BLOCK] } },
  { name: "a key of another case", settings: { Llm: SETTINGS_WITH_BLOCK.Llm, OrkeonCode: BLOCK } },
];

// ── Folder trust ────────────────────────────────────────────────────────────

export const storeOf = (r: Run) => join(r.root, "..", ".orkeon-code", "trusted-folders.json");
export const storedFolders = (r: Run) => (JSON.parse(readFileSync(storeOf(r), "utf-8")) as { folders: { path: string }[] }).folders.map((f) => f.path);

/** A trust home holding a store of `folders`. */
export function trustHome(folders: string[]): string {
  const home = scratchDir("orkeon-code-home-");
  writeFileSync(join(home, "trusted-folders.json"), trustStore(folders));
  return home;
}

/** A trusted folder with a folder two levels below it. */
export function nestedTrust() {
  const nested = scratchDir("orkeon-code-nested-");
  mkdirSync(join(nested, "deep/er"), { recursive: true });
  return { nested, home: trustHome([nested]) };
}

/** A folder and a symlink to it; the store trusts the target, or the link's own name with `trustLink`. */
export function linkedFolder(trustLink = false) {
  const real = scratchDir("orkeon-code-real-");
  const links = scratchDir("orkeon-code-links-");
  const link = join(links, "link");
  symlinkSync(real, link);
  return { real, link, home: trustHome([trustLink ? link : real]) };
}

/** A tool start in an untrusted scratch folder, ORKEON_CODE_HOME at `home`, on `workspace` when given. */
export const untrustedStart = (home: string, workspace?: string): LaunchOptions => ({
  ...TOOL_START, args: workspace === undefined ? TOOL_START.args : ["--mode", "tool", "--workspace", workspace],
  env: { ...ESBUILD, ORKEON_CODE_HOME: home }, trusted: false,
});

/** Stores no launcher wrote: each is refused and kept as it was (`pwsh`: the twin is run on it too). */
export const CORRUPT_STORES: readonly { name: string; text: string; pwsh: boolean }[] = [
  { name: "not JSON", text: "{ not json", pwsh: true },
  { name: "another version", text: '{\n  "version": 2,\n  "folders": []\n}\n', pwsh: false },
  { name: "not in the launchers' layout", text: '{"version":1,"folders":[]}', pwsh: true },
];

/** A trust home holding `text` as its store. */
export function corruptHome(text: string): string {
  const home = scratchDir("orkeon-code-home-");
  writeFileSync(join(home, "trusted-folders.json"), text);
  return home;
}

/** Runs `orkeon-code trust <args>` of the launch's checkout, ORKEON_CODE_HOME and HOME at `home`. */
export const trustOf = (r: Run, home: string, ...args: string[]) =>
  spawnSync("bash", [join(r.root, "orkeon-code"), "trust", ...args], { encoding: "utf-8", env: { PATH: "/usr/bin:/bin", HOME: home, ORKEON_CODE_HOME: home } });

/** The `trust` subcommand of ./orkeon-code on a home of its own, with a folder whose name JSON must escape and a
 *  plain one. */
export function trustCli() {
  const home = scratchDir("orkeon-code-home-");
  const odd = join(scratchDir("orkeon-code-odd-"), 'a "quoted" \\ folder');
  mkdirSync(odd);
  const plain = scratchDir("orkeon-code-plain-");
  const env = { PATH: "/usr/bin:/bin", HOME: home, ORKEON_CODE_HOME: home };
  const launcher = fileURLToPath(new URL("../../orkeon-code", import.meta.url));
  const trust = (...a: string[]) => spawnSync("bash", [launcher, "trust", ...a], { encoding: "utf-8", env });
  const storePath = join(home, "trusted-folders.json");
  const store = () => JSON.parse(readFileSync(storePath, "utf-8"));
  const stored = () => store().folders.map((f: { path: string }) => f.path) as string[];
  return { home, odd, plain, trust, storePath, store, stored };
}

/** Starts the launcher of an earlier launch again on its project, without a terminal, its recording cleared first. */
export function startAgain(r: Run) {
  const base = join(r.root, "..");
  rmSync(join(base, "record"), { recursive: true });
  mkdirSync(join(base, "record"));
  const again = spawnSync("bash", [join(r.root, "orkeon-code"), "--settings", join(base, "settings.json"), "--workspace", r.project, "--mode", "tool"], {
    cwd: base, encoding: "utf-8",
    env: { PATH: `${join(base, "bin")}:/usr/bin:/bin`, HOME: base, ORKEON_CODE_STATE: r.state, RECORD: join(base, "record"), ...ESBUILD },
  });
  let cwd = "";
  try { cwd = readFileSync(join(base, "record", "cwd"), "utf-8").trim(); } catch { /* the REPL did not start */ }
  return { status: again.status, stderr: again.stderr, cwd };
}

/** Runs orkeon-code.ps1 of the launch's checkout with `args`, HOME the scratch folder. */
export const pwshOf = (r: Run, ...args: string[]) =>
  spawnSync(PWSH, ["-NoProfile", "-File", join(r.root, "orkeon-code.ps1"), ...args], {
    encoding: "utf-8", env: { PATH: "/usr/bin:/bin", HOME: join(r.root, ".."), ORKEON_CODE_HOME: join(r.root, "..", ".orkeon-code") },
  });

/** Runs ./orkeon-code of the launch's checkout with `args`, HOME the scratch folder. */
export const bashOf = (r: Run, ...args: string[]) =>
  spawnSync("bash", [join(r.root, "orkeon-code"), ...args], {
    encoding: "utf-8", env: { PATH: "/usr/bin:/bin", HOME: join(r.root, ".."), ORKEON_CODE_HOME: join(r.root, "..", ".orkeon-code") },
  });

/** The CI workflow's lines that start the REPL through the npm shim. */
export const ciStarts = () =>
  readFileSync(fileURLToPath(new URL("../../.github/workflows/ci.yml", import.meta.url)), "utf-8").split("\n").filter((l) => /orkeon-code --mode tool /.test(l));

// ── scripts/run-crew.sh ─────────────────────────────────────────────────────

/** Runs a copy of scripts/run-crew.sh on a crew, from a scratch clone, dotnet a stand-in unless `noDotnet`. */
export function runCrew(extra: string[], opts: { trusted?: boolean; noDotnet?: boolean; env?: Record<string, string> } = {}) {
  const base = scratchDir("orkeon-code-run-crew-");
  const root = join(base, "checkout");
  for (const dir of ["scripts", "config", ".git", "src", "bin", "record"].map((d) => (d === "bin" || d === "record" ? join(base, d) : join(root, d)))) mkdirSync(dir, { recursive: true });
  mkdirSync(join(base, "project"));
  for (const file of ["orkeon-code", ".orkeon-version", "package.json", "scripts/run-crew.sh", "scripts/setup-fixture.sh"]) {
    copyFileSync(fileURLToPath(new URL(`../../${file}`, import.meta.url)), join(root, file));
  }
  writeFileSync(join(root, "config/appsettings.local.json"), SETTINGS_TEXT);
  writeFileSync(join(root, "src/crew.ork.ts"), "");
  if (!opts.noDotnet) {
    writeFileSync(join(base, "bin/dotnet"), DOTNET);
    chmodSync(join(base, "bin/dotnet"), 0o755);
  }
  if (opts.trusted) {
    mkdirSync(join(base, ".orkeon-code"));
    writeFileSync(join(base, ".orkeon-code/trusted-folders.json"), trustStore([join(base, "project")]));
  }
  const r = spawnSync("bash", [join(root, "scripts/run-crew.sh"), join(root, "src/crew.ork.ts"), ...extra], {
    encoding: "utf-8", cwd: base,
    env: { PATH: `${join(base, "bin")}:/usr/bin:/bin`, HOME: base, RECORD: join(base, "record"), ORKEON_CODE_WORKSPACE: join(base, "project"), ...opts.env },
  });
  let calls: string[] = [];
  try { calls = readFileSync(join(base, "record/calls"), "utf-8").split("\n").filter(Boolean); } catch { /* never called */ }
  let env = "";
  try { env = readFileSync(join(base, "record/env"), "utf-8"); } catch { /* never called */ }
  return { ...r, calls, env, project: join(base, "project"), base, root };
}

/** An Orkeon checkout holding the scripting CLI's project, as run-crew.sh's source mode reads it. */
export function crewSource(): string {
  const source = scratchDir("orkeon-code-run-crew-source-");
  mkdirSync(join(source, "src/scripting/Orkeon.Scripting.Cli"), { recursive: true });
  return source;
}

// ── setup ───────────────────────────────────────────────────────────────────

export const EXAMPLE_SETTINGS = { "checkout/config/appsettings.example.json": read("config/appsettings.example.json") };
/** The Ollama example and a settings file already there. */
export const OLLAMA_AND_EXISTING = { "checkout/config/appsettings.ollama.example.json": read("config/appsettings.ollama.example.json"), ".orkeon-code/appsettings.json": "{}" };
export const writtenSettings = (r: Run) => join(r.root, "..", ".orkeon-code/appsettings.json");

// ── Per-project state and sessions ──────────────────────────────────────────

/** A project and a state folder that outlive one launch, so that several launches see what the last one left. */
export function sessionScene() {
  const project = scratchDir("orkeon-code-project-");
  const state = scratchDir("orkeon-code-state-");
  const own = join(state, "projects", slugOf(project));
  const run = (args: string[], env: Record<string, string> = {}, bin: Record<string, string> = TOOL_REPL) =>
    launch({ args: ["--mode", "tool", "--trust", "--workspace", project, ...args], bin, env: { ...ESBUILD, ORKEON_CODE_STATE: state, ...env } });
  /** What the runtime leaves when the REPL ends. */
  const save = (id: string, title: string, messages: number) => {
    mkdirSync(join(own, "sessions", slugOf(project)), { recursive: true });
    const list = Array.from({ length: messages }, (_, i) => `{"Role":"user","Content":"m${i}"}`).join(",");
    writeFileSync(join(own, "sessions", slugOf(project), "last.json"), `{"SessionId":"${id}","Title":"${title}","Messages":[${list}],"State":{}}`);
  };
  const last = () => join(own, "sessions", slugOf(project), "last.json");
  const history = () => readdirSync(join(own, "history")).sort();
  const projectJson = () => JSON.parse(readFileSync(join(own, "project.json"), "utf-8"));
  return { project, state, own, run, save, last, history, projectJson };
}

/** The history's file names without their UTC second. */
export const historyIds = (files: string[]) => files.map((f) => f.replace(/^\d{8}T\d{6}Z-/, ""));

/** abc123 archived by a start, then def456 left open by the REPL that start ran. */
export function twoSessions() {
  const s = sessionScene();
  s.save("abc123", "Fix the parser", 2);
  s.run([]);
  s.save("def456", "Second", 1);
  return s;
}

/** 51 sessions in the history, the oldest first by name. */
export function fullHistory() {
  const s = sessionScene();
  mkdirSync(join(s.own, "history"), { recursive: true });
  for (let i = 0; i < 51; i++) writeFileSync(join(s.own, "history", `2026${String(1001 + i).padStart(4, "0")}T000000Z-s${i}.json`), "{}");
  return s;
}

/** Values of ORKEON_CODE_SESSIONS_KEEP out of 1 to 9999: warned about, nothing more deleted. */
export const KEEP_OUT_OF_RANGE = ["0", "00", "99999999999999999999"];

/** A session left open by a start that still runs (this process holds the lock), and a start made beside it. */
export function lockedScene() {
  const s = sessionScene();
  s.save("abc123", "Open elsewhere", 1);
  mkdirSync(s.own, { recursive: true });
  writeFileSync(join(s.own, ".lock"), `${process.pid}\n`);
  const beside = s.run([]);
  const lock = readFileSync(join(s.own, ".lock"), "utf-8").trim().split("\n");
  return { s, beside, lock };
}

/** What the start beside left when its REPL ended, the first start still holding the lock, an old session archived. */
export function leftBeside() {
  const scene = lockedScene();
  const { s, lock } = scene;
  mkdirSync(join(s.own, "side", lock[1], slugOf(s.project)), { recursive: true });
  writeFileSync(join(s.own, "side", lock[1], slugOf(s.project), "last.json"), '{"SessionId":"side1","Title":"Beside","Messages":[{"Role":"user","Content":"x"}],"State":{}}');
  writeFileSync(join(s.own, ".lock"), `${process.pid}\n`);
  mkdirSync(join(s.own, "history"), { recursive: true });
  writeFileSync(join(s.own, "history", "20261001T000000Z-old.json"), "{}");
  return scene;
}

/** Marks the lock of a scene stale: its pid is no running process. */
export const staleLock = (own: string) => writeFileSync(join(own, ".lock"), "999999999\n");

/** Paths the runtime's ProjectKey.Slug was computed for (dotnet fsi, Orkeon.Infrastructure.dll), and its values. */
export const SLUG_PATHS = ["/home/u/src/app", "/home/u/work/app", "/home/u/My Project.v2", "/home/u/Café-😀", "/work/project", "C:\\Users\\u\\App"];
export const RUNTIME_SLUGS = ["app-bb40879b7896", "app-9abec9881c14", "my-project-v2-061072a7e265", "caf-----7f9fb81a28e4", "project-65d80d2c48b3", "app-d6c9eb3583f9"];
/** Project names the launcher slugs, each under the scratch folder's `sub/`. */
export const PROJECT_NAMES = ["app", "My Project.v2", "Café-😀"];
/** A start on the project `sub/<name>` of the scratch folder. */
export const namedProjectStart = (name: string): LaunchOptions =>
  ({ args: ["--mode", "tool", "--workspace", join("sub", name)], bin: TOOL_REPL, env: ESBUILD, files: { [`sub/${name}/.keep`]: "" } });

// ── What each launcher is read for ──────────────────────────────────────────

export const BASH_GATE: readonly Mention[] = [
  [`export ${GATE}="\${${GATE}:-true}"`, "orkeon-code must export the gate setting"],
  [`-e "${GATE}=$${GATE}"`, "docker mode must pass the gate setting"],
];

export const PS1_GATE: readonly Mention[] = [
  [`if (-not $env:${GATE}) { $env:${GATE} = 'true' }`, "orkeon-code.ps1 must set the gate setting"],
  [`'-e', "${GATE}=$env:${GATE}"`, "docker mode must pass the gate setting"],
];

export const EXAMPLE_SETTINGS_FILES = ["config/appsettings.example.json", "config/appsettings.ollama.example.json", "config/appsettings.ollama-whisper.example.json"];

export const PS1_CLONE_OR_INSTALL: readonly Mention[] = [
  ["$IsClone = Test-Path (Join-Path $Root '.git')", "a .git beside the launcher is a clone"],
  ["$CodeHome = if ($env:ORKEON_CODE_HOME) { $env:ORKEON_CODE_HOME } else { Join-Path $HOME '.orkeon-code' }", "ORKEON_CODE_HOME, else ~/.orkeon-code"],
  ["else { $State = Join-Path $CodeHome $projectRel; $projectRel = '' }", "an install's state, per project"],
  ["install Orkeon from its package or archive", "the install's esbuild message"],
];

export const PS1_VERSION_LINES: readonly Mention[] = [
  ["orkeon-code $codeVersion ($kind`: $Root)", "the first line"],
  ["Orkeon $OrkeonVersion expected, found: $found", "the second line"],
  ["$found = if ($Mode -eq 'docker') { \"image $Image (docker mode, not pulled)\" }", "the forced docker mode names its image first"],
];

export const PS1_FROM_PROJECT: readonly Mention[] = [
  ["$env:ORKEON_ALLOW_EXTERNAL_MOUNTS = '1'", "orkeon-code.ps1 must allow external mounts"],
  ["Push-Location $Workspace", "orkeon-code.ps1 must start the REPL from the project"],
];

export const PS1_SPEECH: readonly Mention[] = [
  [`$audioArgs = @('--mount', "\${audio}:/audio:ro", '--mount', "\${transcripts}:/transcripts:ro")`, "the two mounts"],
  ["& $exe @rest @replArgs @audioArgs @Extra", "the mounts reach the REPL"],
  ["$env:ORKEON_MCP__Servers__whisper__Command = $uv.Source", "uv started by its full path"],
  ["ORKEON_CODE_AUDIO_DIR is ignored in docker mode", "docker mode leaves it aside"],
  [`$settingsText -match '"whisper"\\s*:'`, "a settings file that declares the server wins"],
  ["$_.Name -like 'ORKEON_MCP__Servers__whisper__*'", "a server declared in the environment wins too"],
  ["if ($env:ORKEON_CODE_VOICE -eq '1') {", "the microphone and the speaker on ORKEON_CODE_VOICE=1 only"],
  ["$env:WHISPER_MICROPHONE = '1'", "the microphone and the speaker on ORKEON_CODE_VOICE=1 only"],
  ["$env:WHISPER_SPEAKER = '1'", "the microphone and the speaker on ORKEON_CODE_VOICE=1 only"],
];

export const PS1_USER_SETTINGS: readonly Mention[] = [
  [`'--mount', "\${userConfig}:/user-config:ro"`, "the read-only mount"],
  ["Where-Object { $_.Name -ceq 'orkeonCode' }", "the block alone, its key case for case"],
  ["Get-Content $Settings -Raw -Encoding UTF8", "read as UTF-8 by Windows PowerShell 5.1 too"],
  ["Remove-Item $userConfigFile", "written afresh at each start"],
  ["'/work/state/user-config'", "every mode"],
  ["(Join-Path $State 'tmp') $userConfigDir", "every mode"],
];

export const PS1_DOCKER_TTY: readonly Mention[] = [
  ["$ttyArgs = if ([Console]::IsInputRedirected -or [Console]::IsOutputRedirected) { @('-i') } else { @('-it') }", "-it on a tty only"],
  ["if ($IsLinux) { $userArgs = @('--user', \"$(& id -u):$(& id -g)\") }", "--user on Linux"],
  ["& docker run --rm @ttyArgs @userArgs @envArgs -w /work", "both passed"],
];

export const PS1_MODES: readonly Mention[] = [
  ["if (-not $Sub -and $Mode -and $Mode -notin @('docker', 'tool')) {", "ORKEON_CODE_MODE=source is refused, never run as tool"],
  ["elseif ($value -notin @('docker', 'tool')) {", "--mode=source is refused with the launcher's message, before -Mode's ValidateSet"],
  ["elseif ($name -cin @('-h', '--help')) { $Help = $true }", "--help read"],
  ["if ($Help) { Get-Help $PSCommandPath -Detailed; exit 0 }", "--help printed"],
  ["elseif ($name -eq '--demo') { throw '--demo is only in the bash launcher", "--demo said, not passed to the REPL"],
];

/** The variables orkeon-code.ps1 sets by name. */
export const PS1_SET_VARIABLES = ["ORKEON_ALLOW_EXTERNAL_MOUNTS", "ORKEON_ESBUILD_PATH", "ORKEON_Llm__Model", GATE, START_SCRIPT, PERSIST, SESSIONS_DIR,
  "WHISPER_AUDIO_DIR", "WHISPER_OUT_DIR", "WHISPER_MICROPHONE", "WHISPER_SPEAKER", "ORKEON_MCP__Servers__whisper__Transport",
  "ORKEON_MCP__Servers__whisper__Command", "UV_PROJECT_ENVIRONMENT"].sort();

/** The loop that sets the server's arguments by name. */
export const PS1_ARGS_LOOP = '[Environment]::SetEnvironmentVariable("ORKEON_MCP__Servers__whisper__Args__$i", $whisperArgs[$i])';

/** The variables a script sets by name (`$env:X = …`), sorted, once each. */
export const variablesSet = (script: string) => [...new Set([...script.matchAll(/\$env:(\w+)\s*=(?!=)/g)].map((m) => m[1]))].sort();

/** The most arguments the server gets: Args__0 to Args__12 at most (run, --project, the folder, --frozen for an
 *  install, --extra voice, --extra tts, --extra openai, --extra cuda, the script: 13), two per `--extra` the script
 *  can add. */
export const mostWhisperArgs = (script: string) => 3 + 1 + [...script.matchAll(/\$whisperArgs \+= @\('--extra', '\w+'\)/g)].length * 2 + 1;

/** The names of the server's arguments, Args__0 to Args__<count - 1>. */
export const whisperArgNames = (count: number) => Array.from({ length: count }, (_, i) => `ORKEON_MCP__Servers__whisper__Args__${i}`);

/** The variables the script saves before it sets any, sorted; null when it saves none. */
export function variablesSaved(script: string): string[] | null {
  const saved = /foreach \(\$name in @\(([^)]*)\)\) \{\s*\$savedEnv\[\$name\] = \[Environment\]::GetEnvironmentVariable\(\$name\)/.exec(script);
  return saved === null ? null : [...saved[1].matchAll(/'(\w+)'/g)].map((m) => m[1]).sort();
}

/** A finally that closes the script and puts every saved variable back, removing those that were not set. */
export const RESTORED_IN_FINALLY =
  /\} finally \{(\s*#[^\n]*\n)*\s*foreach \(\$name in \$savedEnv\.Keys\) \{\s*if \(\$null -eq \$savedEnv\[\$name\]\) \{ Remove-Item "env:\$name"[^}]*\}\s*else \{ \[Environment\]::SetEnvironmentVariable\(\$name, \$savedEnv\[\$name\]\) \}\s*\}\s*\}\s*$/;

export const PS1_SUBCOMMANDS: readonly Mention[] = [
  ["[CmdletBinding(PositionalBinding = $false)]", "no positional binding"],
  ["$Extra[0] -cin @('trust', 'setup')", "the subcommands"],
  ["elseif ($name -eq '--trust') { $Trust = [switch] $true }", "--trust as a long option"],
];

/** Where orkeon-code.ps1 checks the folder. */
export const PS1_TRUST_CHECK = "Confirm-Trusted $Workspace $Trust.IsPresent 0";

export const PS1_TRUST_REFUSAL: readonly Mention[] = [
  ["if ([Console]::IsInputRedirected) {", "no terminal: 3"],
  ["    exit 3", "no terminal: 3"],
  ["$env:ORKEON_CODE_TRUST -eq '1' -and $env:CI -ceq 'true'", "CI only"],
  ["'  This trusts every folder below it.'", "the $HOME line"],
];

export const PS1_STORE_LAYOUT: readonly Mention[] = [
  [`'    { "path": "' + (& $escape $_.Path) + '", "trustedAt": "' + (& $escape $_.TrustedAt) + '" }'`, "one folder per line"],
  [`"{\`n  \`"version\`": 1,\`n$folders}\`n"`, "the frame"],
  ["Move-Item -LiteralPath $tmp -Destination $file -Force", "a rename"],
];

export const PS1_SETTINGS: readonly Mention[] = [
  ["$runtimeSettings = Join-Path $configBase 'Orkeon/appsettings.json'", "Orkeon's own"],
  ["if ($settings) { @('--settings', $settings) }", "--settings only when one is passed"],
  ["$(if ($runtimeOwn) { '' } else { $Settings })", "tool mode passes none for Orkeon's own"],
  ["is the old place of the settings: move it to $homeSettings.", "the warning"],
  ["Invoke-Setup $homeSettings", "setup"],
];

export const PS1_SLUG: readonly Mention[] = [
  ["$name = ($path.TrimEnd('/', '\\') -split '[/\\\\]')[-1]", "the last segment"],
  ["($n -ge 48 -and $n -le 57) -or ($n -ge 65 -and $n -le 90) -or ($n -ge 97 -and $n -le 122)", "ASCII letters and digits"],
  ["[System.Security.Cryptography.SHA256]::Create()", "SHA-256 of the UTF-8 path"],
  ["[System.Text.Encoding]::UTF8.GetBytes($path)", "SHA-256 of the UTF-8 path"],
  [".Substring(0, 12)", "12 hex"],
];

export const PS1_SESSION_MOUNTS: readonly Mention[] = [
  [`'--mount', "\${projectState}/\${sessionsSub}:/sessions:rw", '--mount', "\${projectState}/history:/session-history:ro"`, "the mounts"],
  [`$sessionsSub = "side/$PID"`, "beside an open start"],
  ["$env:ORKEON_Orkeon__Cli__Session__SessionsDirectory = '/sessions'", "the folder"],
  ["if (-not $env:Orkeon__Cli__Session__Persist) { $env:Orkeon__Cli__Session__Persist = 'true' }", "persistence"],
  ["'-e', 'ORKEON_Orkeon__Cli__Session__SessionsDirectory=/sessions'", "docker mode"],
  ["$runtimeSlug = if ($Mode -eq 'docker') { Get-ProjectSlug '/work/project' } else { $slug }", "the runtime's slug"],
];

export const PS1_SESSIONS: readonly Mention[] = [
  ["elseif ($Continue) { $sessionNote = 'continued'; Move-SessionsToHistory $sessions $history $side $true }\n  else { Move-SessionsToHistory $sessions $history $side $false }", "fresh by default"],
  ["-match '\"Messages\"\\s*:\\s*\\[\\s*\\]'", "an empty session dropped"],
  ["elseif ($name -cin @('--continue', '-c')) { $Continue = [switch] $true }", "--continue and -c"],
  ["[Console]::Error.WriteLine('orkeon-code: no terminal to choose in: pass --resume <number or id>.')", "no terminal"],
  ["exit 2", "no terminal"],
  ["Get-HistoryFiles $history | Select-Object -Skip $keep | Remove-Item -Force", "retention"],
  ["is not a whole number from 1 to 9999: 50 sessions are kept.", "a bad ORKEON_CODE_SESSIONS_KEEP"],
  ["-match '^[0-9]{1,4}$'", "a bad ORKEON_CODE_SESSIONS_KEEP"],
  ["if ($resumeChoice -match '^[1-9][0-9]{0,3}$' -and [int] $resumeChoice -le $files.Count)", "a number, else an id"],
  ["another session is open on this project (pid $other)", "the lock"],
  ["if ($a -ceq '--llm-log') { if (-not $named) { '--llm-log-path'; \"$projectState/llm-logs\" } }", "--llm-log"],
];
