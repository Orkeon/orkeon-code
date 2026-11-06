import { test } from "node:test";
import assert from "node:assert/strict";
import { longChangelog, runReleaseNotes, SHORT_CHANGELOG } from "./release-notes.fixtures.ts";

const GITHUB_LIMIT = 125000;

test("the notes are the section of the version, without the next one", () => {
  // Arrange
  const changelog = SHORT_CHANGELOG;

  // Act
  const { stdout } = runReleaseNotes("2.0.0", changelog);

  // Assert
  assert.equal(stdout, "### Fixed\n\n- the new entry\n");
});

test("a version with no section in the changelog fails", () => {
  // Arrange
  const changelog = SHORT_CHANGELOG;

  // Act
  const { status } = runReleaseNotes("3.0.0", changelog);

  // Assert
  assert.equal(status, 1);
});

test("a section under the limit is not cut", () => {
  // Arrange
  const changelog = longChangelog(1000);

  // Act
  const { stdout } = runReleaseNotes("2.0.0", changelog);

  // Assert
  assert.doesNotMatch(stdout, /These notes are cut/);
});

const OVER_LIMIT = [
  { name: "a section of ASCII text", filler: "x" },
  { name: "a section of accented text", filler: "é" },
];

for (const c of OVER_LIMIT) {
  test(`${c.name} over GitHub's limit fits it`, () => {
    // Arrange
    const changelog = longChangelog(1300, c.filler);

    // Act
    const { stdout } = runReleaseNotes("2.0.0", changelog);

    // Assert
    assert.ok(stdout.length <= GITHUB_LIMIT, `the notes hold ${stdout.length} characters`);
  });
}

test("a cut section ends on a link to the changelog at the tag", () => {
  // Arrange
  const changelog = longChangelog(1300);

  // Act
  const { stdout } = runReleaseNotes("2.0.0", changelog);

  // Assert
  assert.match(stdout, /\(https:\/\/github\.com\/Orkeon\/orkeon-code\/blob\/v2\.0\.0\/CHANGELOG\.md\)\.\n$/);
});

test("a section is cut at a whole line", () => {
  // Arrange
  const changelog = longChangelog(1300);

  // Act
  const { stdout } = runReleaseNotes("2.0.0", changelog);

  // Assert
  assert.equal(stdout.split("\n\nThese notes")[0].split("\n").at(-1)?.length, 100);
});
