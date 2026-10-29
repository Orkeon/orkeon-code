// The version an operator reads (/version, /release-notes) is the version that was
// released: meta.ts, package.json and the pins of the runtime must agree. Every
// crew declares the script version it is written for, in the form tsc reads as a
// comment (Orkeon's VersionDirectiveParser reads it too).
import { describe, it } from "node:test";
import { deepStrictEqual, match, strictEqual } from "node:assert";
import { CLI_VERSION, ORKEON_RUNTIME_VERSION } from "../../src/commands/_lib/status/meta.ts";
import { callsTo, CREWS_DIR, EXACT_VERSION, firstLines, orkScripts, read, runtimeSources, SRC_DIR, UNSHIPPED_TASK_MEMBERS } from "./version.fixtures.ts";
import { assertEveryScriptOpensWith, assertNoCall } from "./version.assertions.ts";

describe("versions", () => {
  it("meta.ts CLI_VERSION equals package.json version", () => {
    // Arrange
    const packageJson = read("../../package.json");

    // Act
    const version = JSON.parse(packageJson).version;

    // Assert
    strictEqual(CLI_VERSION, version);
  });

  it("meta.ts ORKEON_RUNTIME_VERSION equals .orkeon-version, the runtime /status names", () => {
    // Arrange
    const file = "../../.orkeon-version";

    // Act
    const pinned = read(file).trim();

    // Assert
    strictEqual(ORKEON_RUNTIME_VERSION, pinned);
  });

  it(".orkeon-version is one exact Orkeon version", () => {
    // Arrange
    const file = "../../.orkeon-version";

    // Act
    const pinned = read(file).trim();

    // Assert
    match(pinned, EXACT_VERSION);
  });

  it("the orkeon tool manifest pins the same Orkeon version as .orkeon-version", () => {
    // Arrange
    const pinned = read("../../.orkeon-version").trim();

    // Act
    const manifest = JSON.parse(read("../../.config/dotnet-tools.json"));

    // Assert
    strictEqual(manifest.tools["orkeon.scripting.cli"].version, pinned);
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

  it("no source calls a task-builder member the pinned release does not ship (decision, when)", () => {
    // Arrange
    const files = runtimeSources(SRC_DIR);

    // Act
    const calls = callsTo(SRC_DIR, files, UNSHIPPED_TASK_MEMBERS);

    // Assert
    assertNoCall(calls);
  });
});
