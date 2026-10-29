// The version an operator reads (/version, /release-notes) is the version that was
// released: meta.ts and package.json must agree. The runtime is pinned to one commit
// of Orkeon's main (ADR 0013): .orkeon-version and meta.ts name the same one. Every
// crew declares the script version it is written for, in the form tsc reads as a
// comment (Orkeon's VersionDirectiveParser reads it too).
import { describe, it } from "node:test";
import { deepStrictEqual, match, strictEqual } from "node:assert";
import { CLI_VERSION, ORKEON_RUNTIME_COMMIT } from "../../src/commands/_lib/status/meta.ts";
import { COMMIT_SHA, CREWS_DIR, firstLines, orkScripts, read } from "./version.fixtures.ts";
import { assertEveryScriptOpensWith } from "./version.assertions.ts";

describe("versions", () => {
  it("meta.ts CLI_VERSION equals package.json version", () => {
    // Arrange
    const packageJson = read("../../package.json");

    // Act
    const version = JSON.parse(packageJson).version;

    // Assert
    strictEqual(CLI_VERSION, version);
  });

  it("meta.ts ORKEON_RUNTIME_COMMIT equals .orkeon-version, the pin the launcher and /status name", () => {
    // Arrange
    const file = "../../.orkeon-version";

    // Act
    const pinned = read(file).trim();

    // Assert
    strictEqual(ORKEON_RUNTIME_COMMIT, pinned);
  });

  it(".orkeon-version is one full commit of Orkeon's main, never a release tag", () => {
    // Arrange
    const file = "../../.orkeon-version";

    // Act
    const pinned = read(file).trim();

    // Assert
    match(pinned, COMMIT_SHA);
  });

  it("global.json pins the .NET SDK as Orkeon does: 10.0.300, latest feature band", () => {
    // Arrange
    const globalJson = read("../../global.json");

    // Act
    const { version, rollForward } = JSON.parse(globalJson).sdk;

    // Assert
    deepStrictEqual({ version, rollForward }, { version: "10.0.300", rollForward: "latestFeature" });
  });

  it("every crew and probe opens with `// @orkeon-script 1.0`", () => {
    // Arrange
    const scripts = orkScripts(CREWS_DIR);

    // Act
    const lines = firstLines(CREWS_DIR, scripts);

    // Assert
    assertEveryScriptOpensWith(lines, "// @orkeon-script 1.0");
  });
});
