// /skills (commands/_lib/skills.ts) over FakeSessionStore and FakeFiles: list,
// attach and detach, their refusals and usage lines. Run:
//   node --test tests/commands-skills.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";

import { runSkills } from "../src/commands/_lib/skills.ts";
import { attached, OTHER_SKILL, OUT_OF_RANGE, SKILL, skillsDeps } from "./commands-skills.fixtures.ts";

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
    deepStrictEqual(view, { table: [{ n: 1, path: SKILL }, { n: 2, path: "/workspace/b.md" }] });
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
    const view = await runSkills(["attach", "/workspace/gone.md"], deps);

    // Assert
    deepStrictEqual(view, {
      text: "cannot attach '/workspace/gone.md' — the file is not readable in the mounted workspace.",
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
    deepStrictEqual(attached(deps.session), ["/workspace/b.md"]);
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
    deepStrictEqual(view, { text: "usage: /skills [list|attach <path>|detach <n>]" });
  });
});
