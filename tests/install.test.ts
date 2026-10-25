// The install channels: the runnable archive and its installer, the npm package and its command shim.
//
// The archive is built from `npm pack`'s output (scripts/build-install-archive.sh), so the file list of
// package.json is the only one: the archive and the npm package carry the same files. scripts/install.sh runs
// here for real, into a temporary prefix with a temporary HOME, from the archive built once for the file. The npm package is checked by its file list and its "bin"; orkeon-code.mjs runs for real against a stand-in launcher.
// Run:
//   node --test tests/install.test.ts
import { after, describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readlinkSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  ARCHIVE_ROOT, INSTALL_PS1_CMD, INSTALL_PS1_PREFIX, INSTALL_PS1_UNINSTALL, LAUNCHER_PS1_LONG_OPTIONS, LAUNCHER_PS1_WHISPER,
  LAUNCHER_SH_WHISPER, NOT_SHIPPED, PS1_LEAD, RUNNABLE_FILES, RUNTIME_VERSION, VERSION, archive, archiveEntries,
  checkPublish, dist, extractedArchive, importShim, installSpace, installedSpace, lstatExists, npmLinkedShim, read,
  removeScratch, run, snapshot,
} from "./install.fixtures.ts";
import { assertAllUnder, assertExecutable, assertHolds, assertMentions } from "./install.assertions.ts";

after(removeScratch);

describe("the runnable archive", () => {
  it("is built with its SHA256SUMS", () => {
    // Arrange
    const folder = dist();

    // Act
    const sums = readFileSync(join(folder, "SHA256SUMS"), "utf-8");

    // Assert
    ok(existsSync(archive()), archive());
    ok(sums.includes(`  orkeon-code-${VERSION}.tar.gz`), sums);
  });

  it("holds everything under orkeon-code-<version>/", () => {
    // Arrange
    archive();

    // Act
    const paths = archiveEntries().map((e) => e.path);

    // Assert
    assertAllUnder(paths, ARCHIVE_ROOT);
  });

  it("holds what runs: the launchers, src/, the example settings, the version pin and the installers", () => {
    // Arrange
    archive();

    // Act
    const paths = new Set(archiveEntries().map((e) => e.path.slice(ARCHIVE_ROOT.length)));

    // Assert
    assertHolds(paths, RUNNABLE_FILES);
    ok([...paths].some((p) => p.startsWith("src/crews/")), "the crews");
  });

  it("holds no test, fixture, documentation, work folder or dependency", () => {
    // Arrange
    archive();

    // Act
    const bad = archiveEntries().map((e) => e.path).filter((p) => NOT_SHIPPED.test(p));

    // Assert
    deepStrictEqual(bad, []);
  });

  it("keeps the launcher and the installer executable", () => {
    // Arrange
    archive();

    // Act
    const modes = new Map(archiveEntries().map((e) => [e.path.slice(ARCHIVE_ROOT.length), e.mode]));

    // Assert
    assertExecutable(modes, ["orkeon-code", "scripts/install.sh", "scripts/setup-fixture.sh"]);
  });
});

describe("scripts/install.sh", () => {
  it("installs a local archive: the version folder, current, the command on the bin folder", () => {
    // Arrange
    const s = installSpace();

    // Act
    const r = s.install(["--archive", archive()]);

    // Assert
    strictEqual(r.status, 0, r.stderr + r.stdout);
    strictEqual(readlinkSync(join(s.lib, "current")), VERSION);
    strictEqual(readlinkSync(s.link), "../lib/orkeon-code/current/orkeon-code");
    ok(r.stdout.includes(`export PATH="${join(s.prefix, "bin")}:$PATH"`), r.stdout);
  });

  it("installs a command whose --version names its version, its install folder and the runtime it expects", () => {
    // Arrange
    const s = installedSpace();

    // Act
    const v = run(s.link, ["--version"], { HOME: s.home });

    // Assert
    strictEqual(v.status, 0, v.stderr);
    const [first, second] = v.stdout.split("\n");
    strictEqual(first, `orkeon-code ${VERSION} (install: ${join(s.lib, VERSION)})`);
    ok(second.startsWith(`Orkeon ${RUNTIME_VERSION} expected, found: `), second);
  });

  it("changes nothing when run twice", () => {
    // Arrange
    const s = installedSpace();
    const before = snapshot(s.prefix);

    // Act
    const again = s.install(["--archive", archive()]);

    // Assert
    strictEqual(again.status, 0, again.stderr);
    ok(again.stdout.includes("already installed"), again.stdout);
    deepStrictEqual(snapshot(s.prefix), before);
  });

  it("installs from the extracted archive it sits in", () => {
    // Arrange
    const s = installSpace();
    const extracted = extractedArchive(join(s.base, "x"));

    // Act
    const r = s.install([], join(extracted, "scripts/install.sh"));

    // Assert
    strictEqual(r.status, 0, r.stderr + r.stdout);
    ok(existsSync(join(s.lib, VERSION, "orkeon-code")));
  });

  it("--uninstall, even from the installed copy, removes the program and the link and keeps ~/.orkeon-code", () => {
    // Arrange
    const s = installedSpace();
    mkdirSync(join(s.home, ".orkeon-code"));
    writeFileSync(join(s.home, ".orkeon-code/appsettings.json"), "{}");

    // Act
    // No --prefix: the installed copy knows its own.
    const r = run("bash", [join(s.lib, "current/scripts/install.sh"), "--uninstall"], { HOME: s.home });

    // Assert
    strictEqual(r.status, 0, r.stderr + r.stdout);
    ok(!existsSync(s.lib), "the program is gone");
    ok(!existsSync(s.link) && !lstatExists(s.link), "the link is gone");
    strictEqual(readFileSync(join(s.home, ".orkeon-code/appsettings.json"), "utf-8"), "{}");
  });

  it("refuses to replace an orkeon-code in the bin folder that is not its link", () => {
    // Arrange
    const s = installSpace();
    const mine = "#!/bin/sh\necho mine\n";
    mkdirSync(join(s.prefix, "bin"), { recursive: true });
    writeFileSync(s.link, mine);

    // Act
    const r = s.install(["--archive", archive()]);

    // Assert
    ok(r.status !== 0, "refused");
    ok(r.stderr.includes("not a link"), r.stderr);
    strictEqual(readFileSync(s.link, "utf-8"), mine);
    ok(!existsSync(s.lib), "nothing installed");
  });

  it("refuses to take over another program's link, npm's own command under an npm prefix of ~/.local", () => {
    // Arrange
    const s = installSpace();
    const npmLink = "../lib/node_modules/orkeon-code/orkeon-code.mjs";
    mkdirSync(join(s.prefix, "bin"), { recursive: true });
    symlinkSync(npmLink, s.link);

    // Act
    const r = s.install(["--archive", archive()]);

    // Assert
    ok(r.status !== 0, "refused");
    ok(r.stderr.includes("not to this install"), r.stderr);
    strictEqual(readlinkSync(s.link), npmLink, "npm's link kept");
  });

  it("refuses an archive whose checksum does not match its SHA256SUMS", () => {
    // Arrange
    const s = installSpace();
    const copy = join(s.base, `orkeon-code-${VERSION}.tar.gz`);
    copyFileSync(archive(), copy);
    writeFileSync(join(s.base, "SHA256SUMS"), `${"0".repeat(64)}  orkeon-code-${VERSION}.tar.gz\n`);

    // Act
    const r = s.install(["--archive", copy]);

    // Assert
    ok(r.status !== 0, "refused");
    ok(r.stderr.includes("checksum"), r.stderr);
    ok(!existsSync(s.lib), "nothing installed");
  });

  it("the installer of the repository holds one empty stamp line, for the release to fill", () => {
    // Arrange
    const path = "scripts/install.sh";

    // Act
    const installer = read(path);

    // Assert
    strictEqual(installer.match(/^RELEASE_VERSION=""$/gm)?.length, 1, "one stamp line");
  });

  it("the release stamps the installers it publishes alone with the version they download, and sums them", () => {
    // Arrange
    const folder = dist();

    // Act
    const [sh, ps1, sums] = ["install.sh", "install.ps1", "SHA256SUMS"].map((f) => readFileSync(join(folder, f), "utf-8"));

    // Assert
    ok(sh.includes(`\nRELEASE_VERSION="${VERSION}"\n`), "install.sh stamped");
    ok(ps1.includes(`\n$ReleaseVersion = '${VERSION}'\n`), "install.ps1 stamped");
    ok(sums.includes("  install.sh"), "the installers are summed");
  });

  it("the release workflow builds the archive", () => {
    // Arrange
    const path = ".github/workflows/release.yml";

    // Act
    const workflow = read(path);

    // Assert
    ok(workflow.includes("bash scripts/build-install-archive.sh dist"), "the release builds the archive");
  });
});

// ── The npm package ─────────────────────────────────────────────────────────
// `npm install -g orkeon-code` links the command to orkeon-code.mjs, a shim that starts the launcher beside it.

describe("the npm package", () => {
  it("is publishable, its command is the shim, and it brings its own esbuild", () => {
    // Arrange
    const path = "package.json";

    // Act
    const pkg = JSON.parse(read(path));

    // Assert
    strictEqual(pkg.private, undefined, "not private");
    deepStrictEqual(pkg.bin, { "orkeon-code": "orkeon-code.mjs" });
    ok(pkg.files.includes("orkeon-code.mjs"), "the shim is packed");
    strictEqual(pkg.dependencies?.esbuild, "0.25.12", "esbuild, pinned, a dependency");
    strictEqual(pkg.devDependencies?.esbuild, undefined, "no longer a dev dependency");
    strictEqual(pkg.scripts.prepublishOnly, "node scripts/check-publish.mjs");
  });

  it("packs the shim into the archive too: one file list for both channels", () => {
    // Arrange
    const file = archive();

    // Act
    const list = run("tar", ["-tzf", file]).stdout;

    // Assert
    ok(list.includes(`orkeon-code-${VERSION}/orkeon-code.mjs\n`), "the shim");
  });

  it("refuses to publish outside the release workflow", () => {
    // Arrange
    const env = {};

    // Act
    const laptop = checkPublish(env);

    // Assert
    strictEqual(laptop.status, 1);
    ok(laptop.stderr.includes("release workflow only"), laptop.stderr);
  });

  it("refuses to publish from the release workflow on a tag that is not its version", () => {
    // Arrange
    const env = { GITHUB_ACTIONS: "true", GITHUB_REF_NAME: "v0.0.0" };

    // Act
    const wrongTag = checkPublish(env);

    // Assert
    strictEqual(wrongTag.status, 1);
    ok(wrongTag.stderr.includes(`is not v${VERSION}`), wrongTag.stderr);
  });

  it("publishes from the release workflow, on the tag of its version", () => {
    // Arrange
    const env = { GITHUB_ACTIONS: "true", GITHUB_REF_NAME: `v${VERSION}` };

    // Act
    const r = checkPublish(env);

    // Assert
    strictEqual(r.status, 0);
  });
});

describe("orkeon-code.mjs, the shim", () => {
  for (const platform of ["linux", "darwin"]) {
    it(`starts the bash launcher beside it on ${platform}, the arguments as given`, async () => {
      // Arrange
      const { launchCommand } = await importShim();

      // Act
      const launch = launchCommand(platform, "/p", ["--settings", "s.json", "--", "-x"], false);

      // Assert
      deepStrictEqual(launch, { command: "bash", args: ["/p/orkeon-code", "--settings", "s.json", "--", "-x"] });
    });
  }

  it("starts orkeon-code.ps1 on Windows under pwsh when there is one, its long options made parameters", async () => {
    // Arrange
    const { launchCommand } = await importShim();

    // Act
    const launch = launchCommand("win32", "C:/p", ["--version"], true);

    // Assert
    deepStrictEqual(launch, { command: "pwsh", args: [...PS1_LEAD, "-Version"] });
  });

  it("starts orkeon-code.ps1 on Windows under powershell when there is no pwsh, its long options made parameters", async () => {
    // Arrange
    const { launchCommand } = await importShim();
    const args = ["--settings", "s.json", "--workspace=C:/src", "--mode", "tool", "plan:", "--", "--x"];

    // Act
    const launch = launchCommand("win32", "C:/p", args, false);

    // Assert
    deepStrictEqual(launch,
      { command: "powershell", args: [...PS1_LEAD, "-Settings", "s.json", "-Workspace", "C:/src", "-Mode", "tool", "plan:", "--", "--x"] });
  });

  it("runs the launcher of its package through npm's link, passes the arguments and returns its exit code", () => {
    // Arrange
    const { base, command } = npmLinkedShim();

    // Act
    const r = run(process.execPath, [command, "--mode", "tool", "a b"]);

    // Assert
    strictEqual(r.status, 7, r.stderr);
    strictEqual(readFileSync(join(base, "args"), "utf-8"), "--mode\ntool\na b\n");
    strictEqual(readFileSync(join(base, "esbuild"), "utf-8"), "unset\n", "the shim leaves esbuild to the launcher");
  });

  it("does nothing when imported but hands over its functions", async () => {
    // Arrange
    const load = importShim;

    // Act
    const { launchCommand } = await load();

    // Assert
    strictEqual(typeof launchCommand, "function");
  });

  it("keeps an = inside a value", async () => {
    // Arrange
    const { powershellArgs } = await importShim();

    // Act
    const args = powershellArgs(["--settings=a=b"]);

    // Assert
    deepStrictEqual(args, ["-Settings", "a=b"]);
  });
});

// ── install.ps1 and orkeon-code.ps1, read (pwsh is not on every machine that runs these tests) ──────────────────
describe("scripts/install.ps1 and the long options of orkeon-code.ps1", () => {
  it("uninstalls only the version folders it installed and its own .cmd, then the folders left empty", () => {
    // Arrange
    const path = "scripts/install.ps1";

    // Act
    const script = read(path);

    // Assert
    ok(!/Remove-Item -LiteralPath \$Prefix -Recurse/.test(script), "the prefix is never removed whole");
    assertMentions(script, INSTALL_PS1_UNINSTALL);
  });

  it("knows its prefix when it is the installed copy, and makes a relative -Prefix absolute", () => {
    // Arrange
    const path = "scripts/install.ps1";

    // Act
    const script = read(path);

    // Assert
    assertMentions(script, INSTALL_PS1_PREFIX);
  });

  it("writes an ASCII .cmd naming the launcher relative to itself, and never replaces another program's", () => {
    // Arrange
    const path = "scripts/install.ps1";

    // Act
    const script = read(path);

    // Assert
    assertMentions(script, INSTALL_PS1_CMD);
  });

  it("orkeon-code.ps1 binds the long options a .cmd passes as typed, and drops a -- before the REPL's arguments", () => {
    // Arrange
    const path = "orkeon-code.ps1";

    // Act
    const script = read(path);

    // Assert
    assertMentions(script, LAUNCHER_PS1_LONG_OPTIONS);
    ok(script.indexOf("$Extra = $rest") < script.indexOf("$Root = $PSScriptRoot"), "mapped before anything reads them");
  });
});

// ── An install never writes under its root: the Whisper server's uv environment ─────────────────────────────────
describe("the Whisper server of an install", () => {
  it("runs uv --frozen with its environment under ORKEON_CODE_HOME, in the bash launcher", () => {
    // Arrange
    const path = "orkeon-code";

    // Act
    const sh = read(path);

    // Assert
    assertMentions(sh, LAUNCHER_SH_WHISPER);
  });

  it("runs uv --frozen with its environment under ORKEON_CODE_HOME, in orkeon-code.ps1", () => {
    // Arrange
    const path = "orkeon-code.ps1";

    // Act
    const ps1 = read(path);

    // Assert
    assertMentions(ps1, LAUNCHER_PS1_WHISPER);
  });
});
