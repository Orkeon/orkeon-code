// The release notes of commands/_lib/status/messages.ts (/release-notes), pinned to the sources so they cannot go
// stale. Run:
//   node --test tests/commands/_lib/status/messages.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok } from "node:assert";

import { CLI_VERSION } from "../../../../src/commands/_lib/status/meta.ts";
import { RELEASE_NOTES } from "../../../../src/commands/_lib/status/messages.ts";
import { commandCount, crewNames } from "./messages.fixtures.ts";

describe("B-11 audit — the release notes that had gone stale", () => {
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

  it("names every crew directory in the notes", () => {
    // Arrange
    const crews = crewNames();

    // Act
    const omitted = crews.filter((crew) => !RELEASE_NOTES.includes(crew));

    // Assert
    deepStrictEqual(omitted, [], `RELEASE_NOTES omits crews ${omitted.join(", ")}`);
  });
});
