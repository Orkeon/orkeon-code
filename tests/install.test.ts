// The install channels: the runnable archive and its installer.
//
// The archive is built from `npm pack`'s output (scripts/build-install-archive.sh), so the file list of
// package.json is the only one: the archive and the npm package carry the same files. scripts/install.sh runs
// here for real, into a temporary prefix with a temporary HOME, from the archive built once for the file.
// Run:
//   node --test tests/install.test.ts
import { after, before, describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("..", import.meta.url));
const read = (name: string) => readFileSync(join(REPO, name), "utf-8");
const VERSION = JSON.parse(read("package.json")).version as string;
const RUNTIME_VERSION = read(".orkeon-version").trim();
/** node and npm of this run first, then the system's: what the scripts run under. */
const PATH = `${dirname(process.execPath)}:/usr/bin:/bin`;

const scratch: string[] = [];
after(() => { for (const dir of scratch) rmSync(dir, { recursive: true, force: true }); });
function scratchDir(prefix: string): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  scratch.push(dir);
  return dir;
}

function run(command: string, args: string[], env: Record<string, string> = {}, cwd = REPO) {
  const r = spawnSync(command, args, { cwd, encoding: "utf-8", env: { PATH, HOME: env.HOME ?? tmpdir(), ...env } });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

/** Every entry under `dir`: its kind, its link target or mode and its mtime, to compare two runs. */
function snapshot(dir: string): string[] {
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

let dist = "";
const archive = () => join(dist, `orkeon-code-${VERSION}.tar.gz`);
before(() => {
  dist = scratchDir("orkeon-code-dist-");
  const r = run("bash", [join(REPO, "scripts/build-install-archive.sh"), dist]);
  strictEqual(r.status, 0, r.stderr + r.stdout);
});

describe("the runnable archive", () => {
  const entries = () => run("tar", ["-tzvf", archive()]).stdout.split("\n").filter(Boolean)
    .map((l) => ({ mode: l.split(/\s+/)[0], path: l.split(/\s+/).pop()! }));

  it("is built with its SHA256SUMS, everything under orkeon-code-<version>/", () => {
    ok(existsSync(archive()), archive());
    const sums = readFileSync(join(dist, "SHA256SUMS"), "utf-8");
    ok(sums.includes(`  orkeon-code-${VERSION}.tar.gz`), sums);
    for (const e of entries()) ok(e.path.startsWith(`orkeon-code-${VERSION}/`), e.path);
  });

  it("holds what runs: the launchers, src/, the example settings, the version pin and the installers", () => {
    const paths = new Set(entries().map((e) => e.path.slice(`orkeon-code-${VERSION}/`.length)));
    for (const file of ["orkeon-code", "orkeon-code.ps1", ".orkeon-version", "package.json", "LICENSE.md", "NOTICE.md",
      "config/appsettings.example.json", "scripts/setup-fixture.sh", "scripts/install.sh", "scripts/install.ps1",
      "src/commands/doctor.cmd.ts", "mcp/whisper/whisper_mcp.py"]) {
      ok(paths.has(file), `${file} missing`);
    }
    ok([...paths].some((p) => p.startsWith("src/crews/")), "the crews");
  });

  it("holds no test, fixture, documentation, work folder or dependency", () => {
    const bad = entries().map((e) => e.path).filter((p) =>
      /\.test\.ts$|\/(tests|fixtures|docs|temp|todo|node_modules|\.claude|\.github)\/|\/mcp\/whisper\/(tests|samples)\//.test(p));
    deepStrictEqual(bad, []);
  });

  it("keeps the launcher and the installer executable", () => {
    const modes = new Map(entries().map((e) => [e.path.slice(`orkeon-code-${VERSION}/`.length), e.mode]));
    for (const file of ["orkeon-code", "scripts/install.sh", "scripts/setup-fixture.sh"]) ok(modes.get(file)?.includes("x"), `${file}: ${modes.get(file)}`);
  });
});

describe("scripts/install.sh", () => {
  /** A fresh HOME and prefix; `install` runs the repository's installer there. */
  function space() {
    const base = scratchDir("orkeon-code-install-");
    const home = join(base, "home");
    const prefix = join(base, "prefix");
    mkdirSync(home);
    const install = (args: string[], script = join(REPO, "scripts/install.sh")) =>
      run("bash", [script, "--prefix", prefix, ...args], { HOME: home });
    return { base, home, prefix, install, lib: join(prefix, "lib/orkeon-code"), link: join(prefix, "bin/orkeon-code") };
  }

  it("installs a local archive: the version folder, current, the command on the bin folder, a working --version", () => {
    const s = space();
    const r = s.install(["--archive", archive()]);
    strictEqual(r.status, 0, r.stderr + r.stdout);
    strictEqual(readlinkSync(join(s.lib, "current")), VERSION);
    strictEqual(readlinkSync(s.link), "../lib/orkeon-code/current/orkeon-code");
    ok(r.stdout.includes(`export PATH="${join(s.prefix, "bin")}:$PATH"`), r.stdout);
    const v = run(s.link, ["--version"], { HOME: s.home });
    strictEqual(v.status, 0, v.stderr);
    const [first, second] = v.stdout.split("\n");
    strictEqual(first, `orkeon-code ${VERSION} (install: ${join(s.lib, VERSION)})`);
    ok(second.startsWith(`Orkeon ${RUNTIME_VERSION} expected, found: `), second);
  });

  it("changes nothing when run twice", () => {
    const s = space();
    strictEqual(s.install(["--archive", archive()]).status, 0);
    const before = snapshot(s.prefix);
    const again = s.install(["--archive", archive()]);
    strictEqual(again.status, 0, again.stderr);
    ok(again.stdout.includes("already installed"), again.stdout);
    deepStrictEqual(snapshot(s.prefix), before);
  });

  it("installs from the extracted archive it sits in", () => {
    const s = space();
    const x = join(s.base, "x");
    mkdirSync(x);
    strictEqual(run("tar", ["-xzf", archive(), "-C", x]).status, 0);
    const r = s.install([], join(x, `orkeon-code-${VERSION}`, "scripts/install.sh"));
    strictEqual(r.status, 0, r.stderr + r.stdout);
    ok(existsSync(join(s.lib, VERSION, "orkeon-code")));
  });

  it("--uninstall, even from the installed copy, removes the program and the link and keeps ~/.orkeon-code", () => {
    const s = space();
    strictEqual(s.install(["--archive", archive()]).status, 0);
    mkdirSync(join(s.home, ".orkeon-code"));
    writeFileSync(join(s.home, ".orkeon-code/appsettings.json"), "{}");
    // No --prefix: the installed copy knows its own.
    const r = run("bash", [join(s.lib, "current/scripts/install.sh"), "--uninstall"], { HOME: s.home });
    strictEqual(r.status, 0, r.stderr + r.stdout);
    ok(!existsSync(s.lib), "the program is gone");
    ok(!existsSync(s.link) && !lstatExists(s.link), "the link is gone");
    strictEqual(readFileSync(join(s.home, ".orkeon-code/appsettings.json"), "utf-8"), "{}");
  });

  it("refuses to replace an orkeon-code in the bin folder that is not its link", () => {
    const s = space();
    mkdirSync(join(s.prefix, "bin"), { recursive: true });
    writeFileSync(s.link, "#!/bin/sh\necho mine\n");
    const r = s.install(["--archive", archive()]);
    ok(r.status !== 0, "refused");
    ok(r.stderr.includes("not a link"), r.stderr);
    strictEqual(readFileSync(s.link, "utf-8"), "#!/bin/sh\necho mine\n");
    ok(!existsSync(s.lib), "nothing installed");
  });

  it("refuses an archive whose checksum does not match its SHA256SUMS", () => {
    const s = space();
    const copy = join(s.base, `orkeon-code-${VERSION}.tar.gz`);
    copyFileSync(archive(), copy);
    writeFileSync(join(s.base, "SHA256SUMS"), `${"0".repeat(64)}  orkeon-code-${VERSION}.tar.gz\n`);
    const r = s.install(["--archive", copy]);
    ok(r.status !== 0, "refused");
    ok(r.stderr.includes("checksum"), r.stderr);
    ok(!existsSync(s.lib), "nothing installed");
  });

  it("the release stamps the installer it publishes alone with the version it downloads", () => {
    const installer = read("scripts/install.sh");
    strictEqual(installer.match(/^RELEASE_VERSION=""$/gm)?.length, 1, "one stamp line");
    ok(readFileSync(join(dist, "install.sh"), "utf-8").includes(`\nRELEASE_VERSION="${VERSION}"\n`), "install.sh stamped");
    ok(readFileSync(join(dist, "install.ps1"), "utf-8").includes(`\n$ReleaseVersion = '${VERSION}'\n`), "install.ps1 stamped");
    ok(readFileSync(join(dist, "SHA256SUMS"), "utf-8").includes("  install.sh"), "the installers are summed");
    ok(read(".github/workflows/release.yml").includes("bash scripts/build-install-archive.sh dist"), "the release builds the archive");
  });
});

function lstatExists(p: string): boolean {
  try { lstatSync(p); return true; } catch { return false; }
}
