// The skills suggested for a turn, over fakes. Run:
//   node --test tests/shared/application/skills/suggest-skills.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { suggestSkills } from "../../../../src/shared/application/skills/suggest-skills.ts";
import {
  MIGRATION, NO_MODEL_WARNING, OFFERED, RELEASE, RELEASE_TEXT, REQUEST, REVIEW, SUGGESTED_LINE, chose, suggestSetup,
} from "./suggest-skills.fixtures.ts";

describe("suggestSkills", () => {
  for (const setting of ["off", null]) {
    it(`suggests nothing and lists no folder when skills.suggest is ${setting ?? "unset"}`, async () => {
      // Arrange
      const { deps, files } = suggestSetup(setting);

      // Act
      const skills = await suggestSkills(deps, REQUEST, []);

      // Assert
      deepStrictEqual([skills, files.listed], [[], []]);
    });
  }

  it("suggests nothing and says why when the host has no decision model", async () => {
    // Arrange
    const { deps, decision, log } = suggestSetup();
    decision.present = false;

    // Act
    const skills = await suggestSkills(deps, REQUEST, []);

    // Assert
    deepStrictEqual([skills, log.lines], [[], [NO_MODEL_WARNING]]);
  });

  it("tells the decision model of each skill file by its name and description, the project's own first", async () => {
    // Arrange
    const { deps, decision } = suggestSetup();

    // Act
    await suggestSkills(deps, REQUEST, []);

    // Assert
    deepStrictEqual([decision.asked[0].state, decision.asked[0].questions.skill.criteria], [REQUEST, OFFERED]);
  });

  it("hands the turn the whole file of the skill picked, and says so", async () => {
    // Arrange
    const { deps, log } = suggestSetup();

    // Act
    const skills = await suggestSkills(deps, REQUEST, []);

    // Assert
    deepStrictEqual([skills, log.lines], [[{ path: RELEASE, content: RELEASE_TEXT }], [SUGGESTED_LINE]]);
  });

  it("leaves out of the question a skill a person attached", async () => {
    // Arrange
    const { deps, decision } = suggestSetup();

    // Act
    await suggestSkills(deps, REQUEST, [MIGRATION]);

    // Assert
    deepStrictEqual(Object.values(decision.asked[0].questions.skill.criteria).length, 3);
  });

  it("asks nothing when the project has no skill file", async () => {
    // Arrange
    const { deps, decision, files } = suggestSetup();
    files.listFailure = new Error("not found");

    // Act
    const skills = await suggestSkills(deps, REQUEST, []);

    // Assert
    deepStrictEqual([skills, decision.asked.length], [[], 0]);
  });

  it("skips a skill file that cannot be read", async () => {
    // Arrange
    const { deps, decision, files } = suggestSetup();
    files.readErrors.set(REVIEW, new Error("access denied"));

    // Act
    await suggestSkills(deps, REQUEST, []);

    // Assert
    deepStrictEqual(Object.keys(decision.asked[0].questions.skill.criteria), ["s1", "s2", "none"]);
  });

  it("suggests nothing when the decision model does not answer", async () => {
    // Arrange
    const { deps, decision } = suggestSetup();
    decision.replies = [null];

    // Act
    const skills = await suggestSkills(deps, REQUEST, []);

    // Assert
    deepStrictEqual(skills, []);
  });

  it("keeps what it suggested in the session, for /skills suggest why", async () => {
    // Arrange
    const { deps, session } = suggestSetup();

    // Act
    await suggestSkills(deps, REQUEST, []);

    // Assert
    deepStrictEqual(JSON.parse(session.state.get("skills_suggested") ?? "null"), { offered: 3, picks: [{ path: RELEASE, share: 0.8 }] });
  });

  it("keeps that none fit when the model chose so", async () => {
    // Arrange
    const { deps, session, decision } = suggestSetup();
    decision.answers = chose("none", { s1: 0.1, s2: 0.1, s3: 0.1, none: 0.7 });

    // Act
    await suggestSkills(deps, REQUEST, []);

    // Assert
    strictEqual(session.state.get("skills_suggested"), '{"offered":3,"picks":[]}');
  });
});
