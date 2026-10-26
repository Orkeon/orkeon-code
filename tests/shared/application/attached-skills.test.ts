// The attached /skills over FakeSessionStore and FakeFiles. Run:
//   node --test tests/shared/application/attached-skills.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual } from "node:assert";

import { readAttachedSkills } from "../../../src/shared/application/attached-skills.ts";
import { skillsHarness } from "./attached-skills.fixtures.ts";
import { WORKSPACE } from "../../../src/shared/domain/vfs.ts";

describe("readAttachedSkills", () => {
  it("reads each attached path with its content, in attachment order", async () => {
    // Arrange
    const { session, files } = skillsHarness(`["${WORKSPACE}/b.md","${WORKSPACE}/a.md"]`);
    files.files.set(`${WORKSPACE}/a.md`, "# A");
    files.files.set(`${WORKSPACE}/b.md`, "# B");

    // Act
    const skills = await readAttachedSkills(session, files);

    // Assert
    deepStrictEqual(skills, [
      { path: `${WORKSPACE}/b.md`, content: "# B" },
      { path: `${WORKSPACE}/a.md`, content: "# A" },
    ]);
  });

  it("drops a skill whose file has gone, cannot be read or is blank", async () => {
    // Arrange
    const { session, files } = skillsHarness(`["${WORKSPACE}/gone.md","${WORKSPACE}/locked.md","${WORKSPACE}/blank.md","${WORKSPACE}/ok.md"]`);
    files.readErrors.set(`${WORKSPACE}/locked.md`, new Error("access denied"));
    files.files.set(`${WORKSPACE}/blank.md`, "  \n");
    files.files.set(`${WORKSPACE}/ok.md`, "# OK");

    // Act
    const skills = await readAttachedSkills(session, files);

    // Assert
    deepStrictEqual(skills, [{ path: `${WORKSPACE}/ok.md`, content: "# OK" }]);
  });

  it("skips registry entries that are not paths", async () => {
    // Arrange
    const { session, files } = skillsHarness(`["", null, "${WORKSPACE}/a.md"]`);
    files.files.set(`${WORKSPACE}/a.md`, "# A");

    // Act
    const skills = await readAttachedSkills(session, files);

    // Assert
    deepStrictEqual(skills, [{ path: `${WORKSPACE}/a.md`, content: "# A" }]);
  });

  it("reads nothing from an unset registry", async () => {
    // Arrange
    const { session, files } = skillsHarness(null);

    // Act
    const skills = await readAttachedSkills(session, files);

    // Assert
    deepStrictEqual(skills, []);
  });

  it("reads nothing from a malformed registry", async () => {
    // Arrange
    const { session, files } = skillsHarness("[oops");

    // Act
    const skills = await readAttachedSkills(session, files);

    // Assert
    deepStrictEqual(skills, []);
  });

  it("reads nothing from an unreadable registry", async () => {
    // Arrange
    const { session, files } = skillsHarness(`["${WORKSPACE}/a.md"]`);
    session.failure = new Error("no session_store tool");

    // Act
    const skills = await readAttachedSkills(session, files);

    // Assert
    deepStrictEqual(skills, []);
  });
});
