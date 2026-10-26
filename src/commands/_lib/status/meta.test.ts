// The CLI metadata of commands/_lib/status/meta.ts (/status's version row, /release-notes),
// pinned to the sources so it cannot go stale. Run:
//   node --test src/commands/_lib/status/meta.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual, ok } from "node:assert";
import { readFileSync } from "node:fs";

import { CLI_VERSION, RELEASE_NOTES } from "./meta.ts";
import { commandCount, crewNames, META_SOURCE } from "./meta.fixtures.ts";

describe("B-11 audit — the metadata that had gone stale", () => {
  it("RELEASE_NOTES states the CURRENT command count", () => {
    // Arrange
    // It advertised "50 slash commands" three waves after 50. /release-notes and
    // /version are the one place an operator goes to ask what they are running, so
    // a stale number there is worse than no number.
    const count = commandCount();

    // Act
    const stated = RELEASE_NOTES.includes(`${count} slash commands`);

    // Assert
    ok(stated, `RELEASE_NOTES must say "${count} slash commands"`);
  });

  it("RELEASE_NOTES names the version it is notes for", () => {
    // Arrange
    const version = CLI_VERSION;

    // Act
    const named = RELEASE_NOTES.includes(version);

    // Assert
    ok(named);
  });

  it("no longer claims to mirror the framework version", () => {
    // Arrange
    // meta.ts said it mirrored src/Directory.Build.props while that file read
    // 0.9.2-beta. The two version independently; the header now says so.
    const path = META_SOURCE;

    // Act
    const src = readFileSync(path, "utf-8");

    // Assert
    strictEqual(/Version mirrors src\/Directory\.Build\.props/.test(src), false);
  });

  it("names every crew directory in the notes", () => {
    // Arrange
    const crews = crewNames();

    // Act
    const omitted = crews.filter((crew) => !RELEASE_NOTES.includes(crew));

    // Assert
    deepStrictEqual(omitted, [], `RELEASE_NOTES omits crews ${omitted.join(", ")}`);
  });
});
