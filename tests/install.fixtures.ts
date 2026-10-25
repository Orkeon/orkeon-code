// What the install tests run on: the repository's files, the archive built once for the file, a fresh HOME and
// prefix per test, the npm-linked shim with a stand-in launcher, and the lines the PowerShell scripts must hold.
import { strictEqual } from "node:assert";
import { spawnSync } from "node:child_process";
import { copyFileSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO = fileURLToPath(new URL("..", import.meta.url));
/** A file of the repository, by its path from the root. */
export const read = (name: string) => readFileSync(join(REPO, name), "utf-8");
export const VERSION = JSON.parse(read("package.json")).version as string;
export const RUNTIME_VERSION = read(".orkeon-version").trim();
/** node and npm of this run first, then the system's: what the scripts run under. */
const PATH = `${dirname(process.execPath)}:/usr/bin:/bin`;
/** The folder every path of the archive sits under. */
export const ARCHIVE_ROOT = `orkeon-code-${VERSION}/`;

const scratch: string[] = [];
/** Removes every folder scratchDir made; the test file calls it once, after its tests. */
export function removeScratch(): void {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
}
export function scratchDir(prefix: string): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  scratch.push(dir);
  return dir;
}

export function run(command: string, args: string[], env: Record<string, string> = {}, cwd = REPO) {
  const r = spawnSync(command, args, { cwd, encoding: "utf-8", env: { PATH, HOME: env.HOME ?? tmpdir(), ...env } });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

/** Every entry under `dir`: its kind, its link target or mode and its mtime, to compare two runs. */
export function snapshot(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name);
      const s = lstatSync(p);
      if (s.isSymbolicLink()) out.push(`${p} -> ${readlinkSync(p)} ${s.mtimeMs}`);
      else if (s.isDirectory()) { out.push(`${p}/ ${s.mtimeMs}`); walk(p); }
      else out.push(`${p} ${s.mode.toString(8)} ${s.mtimeMs}`);
    }
  };
  walk(dir);
  return out;
}

export function lstatExists(p: string): boolean {
  try { lstatSync(p); return true; } catch { return false; }
}

let builtDist: string | undefined;
/** The folder scripts/build-install-archive.sh wrote the archive, its sums and the stamped installers to: built at
 *  the first call, the same folder for every test after it. */
export function dist(): string {
  if (builtDist === undefined) {
    const dir = scratchDir("orkeon-code-dist-");
    const r = run("bash", [join(REPO, "scripts/build-install-archive.sh"), dir]);
    strictEqual(r.status, 0, r.stderr + r.stdout);
    builtDist = dir;
  }
  return builtDist;
}
export const archive = () => join(dist(), `orkeon-code-${VERSION}.tar.gz`);

/** The archive's entries, as `tar -tzvf` lists them: the mode and the path. */
export const archiveEntries = () => run("tar", ["-tzvf", archive()]).stdout.split("\n").filter(Boolean)
  .map((l) => ({ mode: l.split(/\s+/)[0], path: l.split(/\s+/).pop()! }));

/** What runs, each path from the archive's root folder. */
export const RUNNABLE_FILES = ["orkeon-code", "orkeon-code.ps1", ".orkeon-version", "package.json", "LICENSE.md", "NOTICE.md",
  "config/appsettings.example.json", "scripts/setup-fixture.sh", "scripts/install.sh", "scripts/install.ps1",
  "src/commands/doctor.cmd.ts", "mcp/whisper/whisper_mcp.py"];

/** A path the archive never holds: a test, a fixture, the documentation, a work folder, a dependency. */
export const NOT_SHIPPED = /\.test\.ts$|\/(tests|fixtures|docs|temp|todo|node_modules|\.claude|\.github)\/|\/mcp\/whisper\/(tests|samples)\//;

/** A fresh HOME and prefix; `install` runs the repository's installer there. */
export function installSpace() {
  const base = scratchDir("orkeon-code-install-");
  const home = join(base, "home");
  const prefix = join(base, "prefix");
  mkdirSync(home);
  const install = (args: string[], script = join(REPO, "scripts/install.sh")) =>
    run("bash", [script, "--prefix", prefix, ...args], { HOME: home });
  return { base, home, prefix, install, lib: join(prefix, "lib/orkeon-code"), link: join(prefix, "bin/orkeon-code") };
}

/** A space the archive is already installed in: stops the test when that install fails. */
export function installedSpace() {
  const s = installSpace();
  const r = s.install(["--archive", archive()]);
  strictEqual(r.status, 0, `the first install failed: ${r.stderr}${r.stdout}`);
  return s;
}

/** The archive extracted under `into`: the folder of its root. */
export function extractedArchive(into: string): string {
  mkdirSync(into);
  strictEqual(run("tar", ["-xzf", archive(), "-C", into]).status, 0, "the archive does not extract");
  return join(into, `orkeon-code-${VERSION}`);
}

/** scripts/check-publish.mjs run under `env`. */
export const checkPublish = (env: Record<string, string>) => run(process.execPath, [join(REPO, "scripts/check-publish.mjs")], env);

/** The shim, imported. */
export const importShim = () => import(join(REPO, "orkeon-code.mjs"));

/** The arguments every start of orkeon-code.ps1 from C:/p opens with. */
export const PS1_LEAD = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", join("C:/p", "orkeon-code.ps1")];

/** The package as npm installs it under `base`: the shim beside a stand-in launcher, linked from `base`/bin. The
 *  launcher records its arguments in `base`/args and what it got of ORKEON_ESBUILD_PATH in `base`/esbuild, exits 7. */
export function npmLinkedShim(): { base: string; command: string } {
  const base = scratchDir("orkeon-code-shim-");
  const root = join(base, "lib/node_modules/orkeon-code");
  mkdirSync(root, { recursive: true });
  copyFileSync(join(REPO, "orkeon-code.mjs"), join(root, "orkeon-code.mjs"));
  writeFileSync(join(root, "orkeon-code"),
    `#!/usr/bin/env bash\nprintf '%s\\n' "$@" > "${base}/args"\necho "\${ORKEON_ESBUILD_PATH:-unset}" > "${base}/esbuild"\nexit 7\n`);
  mkdirSync(join(base, "bin"));
  symlinkSync("../lib/node_modules/orkeon-code/orkeon-code.mjs", join(base, "bin/orkeon-code"));
  return { base, command: join(base, "bin/orkeon-code") };
}

/** A line a script must hold, and what it stands for. */
export type Mention = readonly [snippet: string, what: string];

export const INSTALL_PS1_UNINSTALL: readonly Mention[] = [
  [".name -eq 'orkeon-code'", "a version folder is one holding the package.json of orkeon-code"],
  ["-not (Test-Path -LiteralPath (Join-Path $_.FullName '.git')) -and", "never a git clone under the prefix"],
  ["[IO.File]::ReadAllText($cmd).Contains($marker))) { Remove-Item -LiteralPath $cmd -Force }", "only its own .cmd"],
  ["-not (Get-ChildItem -LiteralPath $dir -Force)) { Remove-Item -LiteralPath $dir -Force }", "bin and the prefix removed only when empty"],
];

export const INSTALL_PS1_PREFIX: readonly Mention[] = [
  ["if (-not $PSBoundParameters.ContainsKey('Prefix')) {", "-Prefix given wins"],
  ["$selfPrefix = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent", "derived from its own path"],
  ["$Prefix = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Prefix)", "resolved against PowerShell's location"],
];

export const INSTALL_PS1_CMD: readonly Mention[] = [
  ["-File `\"%~dp0..\\$version\\orkeon-code.ps1`\" %*", "relative to the .cmd"],
  ["[IO.File]::WriteAllText($cmd, $wrapper, [Text.Encoding]::ASCII)", "ASCII"],
  ["was not written by install.ps1: move it away", "another .cmd is refused"],
];

export const LAUNCHER_PS1_LONG_OPTIONS: readonly Mention[] = [
  ["if ($a -match '^(--(?:settings|workspace|mode))=(.*)$')", "--name=value"],
  ["if ($name -eq '--version') { $Version = [switch] $true }", "--version"],
  ["if ($name -eq '--settings') { $Settings = $value }", "--settings"],
  ["if ($i + 1 -lt $Extra.Count) { $rest += $Extra[($i + 1)..($Extra.Count - 1)] }", "after --"],
];

export const LAUNCHER_SH_WHISPER: readonly Mention[] = [
  ['if [ "$KIND" = install ]; then\n      whisper_args+=(--frozen)', "bash: --frozen for an install"],
  ['export UV_PROJECT_ENVIRONMENT="${UV_PROJECT_ENVIRONMENT:-$CODE_HOME/whisper/.venv}"', "bash: the venv"],
];

export const LAUNCHER_PS1_WHISPER: readonly Mention[] = [
  ["if (-not $IsClone) {\n        $whisperArgs += @('--frozen')", "ps1: --frozen for an install"],
  ["$env:UV_PROJECT_ENVIRONMENT = Join-Path $CodeHome 'whisper\\.venv'", "ps1: the venv"],
];
