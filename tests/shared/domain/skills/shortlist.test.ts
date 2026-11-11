// Suggesting skills: a skill's card, the question asked and the picks read. Run:
//   node --test tests/shared/domain/skills/shortlist.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { offerable, shortlistOf, shortlistQuestion, skillCard, skillKey, suggestOn, suggestState } from "../../../../src/shared/domain/skills/shortlist.ts";
import { CARDS, CARD_CASES, KEY_CASES, LONG_HEAD, OFFERABLE_CASES, PICK_CASES } from "./shortlist.fixtures.ts";

describe("suggestOn", () => {
  for (const c of [{ value: "on", on: true }, { value: " On ", on: true }, { value: "off", on: false }, { value: undefined, on: false }]) {
    it(`reads ${JSON.stringify(c.value)} as ${c.on ? "on" : "off"}`, () => {
      // Arrange
      const value = c.value;

      // Act
      const on = suggestOn(value);

      // Assert
      strictEqual(on, c.on);
    });
  }
});

describe("skillCard", () => {
  for (const c of CARD_CASES) {
    it(c.name, () => {
      // Arrange
      const head = c.head;

      // Act
      const card = skillCard(c.path, head);

      // Assert
      deepStrictEqual(card, c.expected);
    });
  }

  it("cuts a description at 300 characters", () => {
    // Arrange
    const head = LONG_HEAD;

    // Act
    const card = skillCard("/workspace/.orkeon/skills/long.md", head);

    // Assert
    strictEqual(card.description, `${"d".repeat(300)}...`);
  });
});

describe("offerable", () => {
  for (const c of OFFERABLE_CASES) {
    it(c.name, () => {
      // Arrange
      const head = c.head;

      // Act
      const may = offerable(head);

      // Assert
      strictEqual(may, c.offerable);
    });
  }
});

describe("skillKey", () => {
  for (const c of KEY_CASES) {
    it(`reads ${JSON.stringify(c.path)} as ${c.key}`, () => {
      // Arrange
      const path = c.path;

      // Act
      const key = skillKey(path);

      // Assert
      strictEqual(key, c.key);
    });
  }
});

describe("suggestState", () => {
  it("is the request, cut at 2 000 characters", () => {
    // Arrange
    const request = ` ${"r".repeat(2_500)} `;

    // Act
    const state = suggestState(request);

    // Assert
    strictEqual(state, `${"r".repeat(2_000)}...`);
  });
});

describe("shortlistQuestion", () => {
  it("asks one choice among the skills, numbered, and the option that none fits", () => {
    // Arrange
    const cards = CARDS;

    // Act
    const { skill } = shortlistQuestion(cards);

    // Assert
    deepStrictEqual(
      [skill.type, skill.criteria],
      ["choice", { s1: "release: Cut a release", s2: "migration", s3: "review: Review a change", none: "None of these playbooks helps with this request." }],
    );
  });
});

describe("shortlistOf", () => {
  for (const c of PICK_CASES) {
    it(c.name, () => {
      // Arrange
      const answers = c.answers;

      // Act
      const picks = shortlistOf(answers, CARDS);

      // Assert
      deepStrictEqual(picks, c.expected);
    });
  }
});
