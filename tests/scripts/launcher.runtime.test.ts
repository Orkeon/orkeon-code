// The runtime the bash launcher downloads at the first start (ADR 0028): an install on a machine with neither
// orkeon-repl, Docker nor ORKEON_SOURCE fetches the archive .orkeon-runtime names, once, after asking. The launcher
// runs for real, with a curl that serves a tiny archive from the disk: nothing here reaches the network.
import { after, describe, it } from "node:test";
import { ok, strictEqual } from "node:assert";
import { existsSync } from "node:fs";
import { PTY, RUNTIME_PIN, launch, removeScratch } from "./launcher.fixtures.ts";
import { assertSays } from "./launcher.assertions.ts";
import {
  AGREED, DOCKER, NO_TERMINAL, QUESTION, RUNTIME_ID, TOOL, WRONG_SUM,
  homeWithRuntime, installStart, manifest, runtimeHome,
} from "./launcher.runtime.fixtures.ts";
import {
  assertDownloadedOnce, assertNoRuntimeKept, assertNothingDownloaded, assertNothingStarted, assertOwnReplStarted, assertRuntimeInstalled,
} from "./launcher.runtime.assertions.ts";

after(removeScratch);

describe("orkeon-code, the runtime downloaded at the first start", () => {
  it("downloads the runtime, then starts its REPL, when the download is agreed and the machine has no runtime", () => {
    // Arrange
    const start = installStart({ env: AGREED });

    // Act
    const r = launch(start);

    // Assert
    strictEqual(r.status, 0, r.stderr);
    assertDownloadedOnce(r);
    assertRuntimeInstalled(runtimeHome(r), RUNTIME_ID);
    assertOwnReplStarted(r);
  });

  it("stops with exit 3 where there is no terminal to ask in, naming the two ways to agree", () => {
    // Arrange
    const start = installStart();

    // Act
    const r = launch(start);

    // Assert
    strictEqual(r.status, 3, r.stderr);
    assertSays(r.stderr, NO_TERMINAL);
    assertNothingDownloaded(r, runtimeHome(r));
    assertNothingStarted(r);
  });

  it("deletes a download whose sum is not the one of .orkeon-runtime, and starts nothing", () => {
    // Arrange
    const start = installStart({ env: AGREED, manifest: manifest({ sum: WRONG_SUM }) });

    // Act
    const r = launch(start);

    // Assert
    strictEqual(r.status, 1, r.stderr);
    assertSays(r.stderr, ["checksum mismatch", WRONG_SUM, "nothing installed"]);
    assertNoRuntimeKept(runtimeHome(r));
    assertNothingStarted(r);
  });

  it("keeps the runtime of the earlier package when the new download has a wrong sum", () => {
    // Arrange
    const home = homeWithRuntime("old0000");
    const start = installStart({ env: { ...AGREED, ORKEON_CODE_HOME: home }, manifest: manifest({ sum: WRONG_SUM }) });

    // Act
    const r = launch(start);

    // Assert
    assertRuntimeInstalled(runtimeHome(r, home), "old0000");
  });

  it("starts the runtime already downloaded without downloading again", () => {
    // Arrange
    const home = homeWithRuntime();
    const start = installStart({ env: { ORKEON_CODE_HOME: home } });

    // Act
    const r = launch(start);

    // Assert
    strictEqual(r.status, 0, r.stderr);
    ok(!r.calls.some((c) => c.startsWith("curl ")), r.calls.join(", "));
    assertOwnReplStarted(r);
  });

  it("removes the runtime of an earlier package once the new one is installed", () => {
    // Arrange
    const home = homeWithRuntime("old0000");
    const start = installStart({ env: { ...AGREED, ORKEON_CODE_HOME: home } });

    // Act
    const r = launch(start);

    // Assert
    strictEqual(r.status, 0, r.stderr);
    assertRuntimeInstalled(runtimeHome(r, home), RUNTIME_ID);
  });

  it("downloads nothing when Docker is installed: the docker mode runs", () => {
    // Arrange
    const start = installStart({ bin: DOCKER, env: AGREED });

    // Act
    const r = launch(start);

    // Assert
    strictEqual(r.status, 0, r.stderr);
    strictEqual(r.args[0], "run", "docker run");
    assertNothingDownloaded(r, runtimeHome(r));
  });

  it("runs the runtime already downloaded rather than Docker", () => {
    // Arrange
    const home = homeWithRuntime();
    const start = installStart({ bin: DOCKER, env: { ORKEON_CODE_HOME: home } });

    // Act
    const r = launch(start);

    // Assert
    strictEqual(r.status, 0, r.stderr);
    assertOwnReplStarted(r);
  });

  it("downloads nothing when orkeon-repl is on PATH: the user's own runtime runs", () => {
    // Arrange
    const start = installStart({ bin: TOOL, env: AGREED });

    // Act
    const r = launch(start);

    // Assert
    strictEqual(r.status, 0, r.stderr);
    strictEqual(r.cwd, r.project);
    assertNothingDownloaded(r, runtimeHome(r));
  });

  it("downloads the runtime in the tool mode asked by --mode, whatever else is installed", () => {
    // Arrange
    const start = installStart({ args: ["--mode", "tool"], bin: DOCKER, env: AGREED });

    // Act
    const r = launch(start);

    // Assert
    strictEqual(r.status, 0, r.stderr);
    assertDownloadedOnce(r);
    assertOwnReplStarted(r);
  });

  it("keeps the no-runtime error in a checkout, whose .orkeon-runtime names no archive", () => {
    // Arrange
    const start = installStart({ env: AGREED, manifest: manifest({ id: "" }) });

    // Act
    const r = launch(start);

    // Assert
    strictEqual(r.status, 1, r.stderr);
    assertSays(r.stderr, ["no Orkeon runtime found: install Docker, or the orkeon-repl tool, or set ORKEON_SOURCE"]);
    assertNothingDownloaded(r, runtimeHome(r));
  });

  it("names the platform no archive is published for", () => {
    // Arrange
    const start = installStart({ env: AGREED, platform: ["SunOS", "sun4v"] });

    // Act
    const r = launch(start);

    // Assert
    strictEqual(r.status, 1, r.stderr);
    assertSays(r.stderr, ["no Orkeon runtime is published for this platform (SunOS sun4v)"]);
    assertNothingDownloaded(r, runtimeHome(r));
  });

  describe("asked in a terminal", { skip: PTY ? false : "util-linux script is not available" }, () => {
    it("y: the question names the runtime and its folder, then the runtime is downloaded and started", () => {
      // Arrange
      const start = installStart({ tty: "y\n" });

      // Act
      const r = launch(start);

      // Assert
      strictEqual(r.status, 0, r.stdout);
      assertSays(r.stdout, [...QUESTION, runtimeHome(r)]);
      assertRuntimeInstalled(runtimeHome(r), RUNTIME_ID);
      assertOwnReplStarted(r);
    });

    it("n: exit 0, nothing downloaded, nothing started", () => {
      // Arrange
      const start = installStart({ tty: "n\n" });

      // Act
      const r = launch(start);

      // Assert
      strictEqual(r.status, 0, r.stdout);
      assertSays(r.stdout, ["nothing downloaded, nothing started"]);
      assertNothingDownloaded(r, runtimeHome(r));
      assertNothingStarted(r);
    });
  });
});

describe("orkeon-code runtime install and remove", () => {
  it("install downloads the runtime without asking and starts nothing", () => {
    // Arrange
    const start = installStart({ args: ["runtime", "install"], bare: true });

    // Act
    const r = launch(start);

    // Assert
    strictEqual(r.status, 0, r.stderr);
    assertDownloadedOnce(r);
    assertRuntimeInstalled(runtimeHome(r), RUNTIME_ID);
    strictEqual(r.cwd, "", "no REPL started");
  });

  it("install says the runtime is already there, and downloads nothing", () => {
    // Arrange
    const home = homeWithRuntime();
    const start = installStart({ args: ["runtime", "install"], bare: true, env: { ORKEON_CODE_HOME: home } });

    // Act
    const r = launch(start);

    // Assert
    strictEqual(r.status, 0, r.stderr);
    assertSays(r.stdout, [`Orkeon ${RUNTIME_ID} is already in`]);
    ok(!r.calls.some((c) => c.startsWith("curl ")), r.calls.join(", "));
  });

  it("remove deletes the downloaded runtime", () => {
    // Arrange
    const home = homeWithRuntime();
    const start = installStart({ args: ["runtime", "remove"], bare: true, env: { ORKEON_CODE_HOME: home } });

    // Act
    const r = launch(start);

    // Assert
    strictEqual(r.status, 0, r.stderr);
    ok(!existsSync(runtimeHome(r, home)), "the runtime folder is gone");
  });

  it("an unknown word prints the usage", () => {
    // Arrange
    const start = installStart({ args: ["runtime", "update"], bare: true });

    // Act
    const r = launch(start);

    // Assert
    strictEqual(r.status, 1);
    assertSays(r.stderr, ["usage: orkeon-code runtime install | remove"]);
  });
});

describe("orkeon-code --version, the downloaded runtime", () => {
  it("names the runtime downloaded and its folder", () => {
    // Arrange
    const home = homeWithRuntime();
    const start = installStart({ args: ["--version"], bare: true, env: { ORKEON_CODE_HOME: home } });

    // Act
    const r = launch(start);

    // Assert
    strictEqual(r.stdout.split("\n")[1], `Orkeon ${RUNTIME_PIN} expected, found: ${RUNTIME_ID} (downloaded, ${runtimeHome(r, home)}/${RUNTIME_ID})`);
  });

  it("says the runtime comes at the first start when the machine has none yet, and downloads nothing", () => {
    // Arrange
    const start = installStart({ args: ["--version"], bare: true });

    // Act
    const r = launch(start);

    // Assert
    strictEqual(r.stdout.split("\n")[1], `Orkeon ${RUNTIME_PIN} expected, found: none yet (${RUNTIME_ID} is downloaded at the first start)`);
    assertNothingDownloaded(r, runtimeHome(r));
  });
});
