// The attached /skills over FakeSessionStore and FakeFiles. Run:
//   node --test src/shared/application/attached-skills.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual } from "node:assert";

import { readAttachedSkills } from "./attached-skills.ts";
import { skillsHarness } from "./attached-skills.fixtures.ts";

describe("readAttachedSkills", () => {
  it("reads each attached path with its content, in attachment order", async () => {
    // Arrange
    const { session, files } = skillsHarness(`["/workspace/b.md","/workspace/a.md"]`);
    files.files.set("/workspace/a.md", "# A");
    files.files.set("/workspace/b.md", "# B");

    // Act
    const skills = await readAttachedSkills(session, files);

    // Assert
    deepStrictEqual(skills, [
      { path: "/workspace/b.md", content: "# B" },
      { path: "/workspace/a.md", content: "# A" },
    ]);
  });

  it("drops a skill whose file has gone, cannot be read or is blank", async () => {
    // Arrange
    const { session, files } = skillsHarness(`["/workspace/gone.md","/workspace/locked.md","/workspace/blank.md","/workspace/ok.md"]`);
    files.readErrors.set("/workspace/locked.md", new Error("access denied"));
    files.files.set("/workspace/blank.md", "  \n");
    files.files.set("/workspace/ok.md", "# OK");

    // Act
    const skills = await readAttachedSkills(session, files);

    // Assert
    deepStrictEqual(skills, [{ path: "/workspace/ok.md", content: "# OK" }]);
  });

  it("skips registry entries that are not paths", async () => {
    // Arrange
    const { session, files } = skillsHarness(`["", null, "/workspace/a.md"]`);
    files.files.set("/workspace/a.md", "# A");

    // Act
    const skills = await readAttachedSkills(session, files);

    // Assert
    deepStrictEqual(skills, [{ path: "/workspace/a.md", content: "# A" }]);
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
    const { session, files } = skillsHarness(`["/workspace/a.md"]`);
    session.failure = new Error("no session_store tool");

    // Act
    const skills = await readAttachedSkills(session, files);

    // Assert
    deepStrictEqual(skills, []);
  });
});
