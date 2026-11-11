// /skills (commands/_lib/settings/skills.ts) over FakeSessionStore and FakeFiles: list,
// attach and detach, their refusals and usage lines. Run:
//   node --test tests/commands/_lib/settings/skills.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";

import { runSkills } from "../../../../src/commands/_lib/settings/skills.ts";
import {
  attached, LAST_SUGGESTION, OTHER_SKILL, OUT_OF_RANGE, SKILL, skillsDeps, SUGGEST_ON, SUGGEST_ON_NO_MODEL, SUGGEST_STATUS_OFF, suggestDeps,
} from "./skills.fixtures.ts";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";

describe("/skills list", () => {
  it("says none are attached, with the usage (the default sub-command)", async () => {
    // Arrange
    const deps = skillsDeps();

    // Act
    const view = await runSkills([], deps);

    // Assert
    deepStrictEqual(view, {
      text: "no skills attached. usage: /skills attach <workspace path to a .md playbook>",
    });
  });

  it("tables the attached paths, numbered", async () => {
    // Arrange
    const deps = skillsDeps([SKILL, OTHER_SKILL]);

    // Act
    const view = await runSkills(["list"], deps);

    // Assert
    deepStrictEqual(view, { table: [{ n: 1, path: SKILL }, { n: 2, path: `${WORKSPACE}/b.md` }] });
  });
});

describe("/skills attach", () => {
  it("attaches a readable file", async () => {
    // Arrange
    const deps = skillsDeps();

    // Act
    const view = await runSkills(["attach", SKILL], deps);

    // Assert
    deepStrictEqual(view, { text: `skill attached: ${SKILL} (1 attached; /clear clears).` });
    deepStrictEqual(attached(deps.session), [SKILL]);
  });

  it("attaches a readable file once, however often it is attached", async () => {
    // Arrange
    const deps = skillsDeps([SKILL]);

    // Act
    const view = await runSkills(["attach", SKILL], deps);

    // Assert
    deepStrictEqual(view, { text: `skill attached: ${SKILL} (1 attached; /clear clears).` });
    deepStrictEqual(attached(deps.session), [SKILL]);
  });

  it("refuses a file it cannot read", async () => {
    // Arrange
    const deps = skillsDeps();

    // Act
    const view = await runSkills(["attach", `${WORKSPACE}/gone.md`], deps);

    // Assert
    deepStrictEqual(view, {
      text: `cannot attach '${WORKSPACE}/gone.md' — the file is not readable in the mounted workspace.`,
    });
    strictEqual(attached(deps.session), null);
  });

  it("asks for a path", async () => {
    // Arrange
    const deps = skillsDeps();

    // Act
    const view = await runSkills(["attach"], deps);

    // Assert
    deepStrictEqual(view, { text: "usage: /skills attach <path>" });
    strictEqual(attached(deps.session), null);
  });
});

describe("/skills detach", () => {
  it("detaches by number", async () => {
    // Arrange
    const deps = skillsDeps([SKILL, OTHER_SKILL]);

    // Act
    const view = await runSkills(["detach", "1"], deps);

    // Assert
    deepStrictEqual(view, { text: `skill detached: ${SKILL}` });
    deepStrictEqual(attached(deps.session), [`${WORKSPACE}/b.md`]);
  });

  for (const c of OUT_OF_RANGE) {
    it(`refuses a number out of range, with the range: ${c.name}`, async () => {
      // Arrange
      const deps = skillsDeps(c.attached);

      // Act
      const view = await runSkills(["detach", c.n], deps);

      // Assert
      deepStrictEqual(view, { text: c.text });
    });
  }
});

describe("/skills — anything else", () => {
  it("answers the usage line", async () => {
    // Arrange
    const deps = skillsDeps();

    // Act
    const view = await runSkills(["load"], deps);

    // Assert
    deepStrictEqual(view, { text: "usage: /skills [list|attach <path>|detach <n>|suggest [on|off|why]]" });
  });
});

describe("/skills suggest", () => {
  it("says where the suggestion stands when bare", async () => {
    // Arrange
    const deps = suggestDeps();

    // Act
    const view = await runSkills(["suggest"], deps);

    // Assert
    strictEqual(view.text, SUGGEST_STATUS_OFF);
  });

  it("turns the suggestion on for the session", async () => {
    // Arrange
    const deps = suggestDeps();

    // Act
    const view = await runSkills(["suggest", "on"], deps);

    // Assert
    deepStrictEqual([view.text, deps.config.session], [SUGGEST_ON, { "skills.suggest": "on" }]);
  });

  it("warns when turned on without a decision model", async () => {
    // Arrange
    const deps = suggestDeps();
    deps.decision.present = false;

    // Act
    const view = await runSkills(["suggest", "on"], deps);

    // Assert
    strictEqual(view.text, SUGGEST_ON_NO_MODEL);
  });

  it("turns the suggestion off for the session", async () => {
    // Arrange
    const deps = suggestDeps();
    deps.config.session = { "skills.suggest": "on" };

    // Act
    await runSkills(["suggest", "off"], deps);

    // Assert
    deepStrictEqual(deps.config.session, { "skills.suggest": "off" });
  });

  it("shows what the last turn was suggested, with each share", async () => {
    // Arrange
    const deps = suggestDeps();
    deps.session.state.set("skills_suggested", LAST_SUGGESTION);

    // Act
    const view = await runSkills(["suggest", "why"], deps);

    // Assert
    deepStrictEqual(view, { lines: [`${SKILL} (0.80)`], text: "suggested to the last turn, among 3 skill(s)." });
  });

  it("says no skill fit the last turn", async () => {
    // Arrange
    const deps = suggestDeps();
    deps.session.state.set("skills_suggested", '{"offered":3,"picks":[]}');

    // Act
    const view = await runSkills(["suggest", "why"], deps);

    // Assert
    strictEqual(view.text, "the last turn was offered 3 skill(s): none fit its request.");
  });

  it("says nothing was suggested yet", async () => {
    // Arrange
    const deps = suggestDeps();

    // Act
    const view = await runSkills(["suggest", "why"], deps);

    // Assert
    strictEqual(view.text, "no skill was suggested yet in this session.");
  });

  it("answers its usage for another word", async () => {
    // Arrange
    const deps = suggestDeps();

    // Act
    const view = await runSkills(["suggest", "maybe"], deps);

    // Assert
    strictEqual(view.text, "usage: /skills suggest [on|off|why]");
  });
});

