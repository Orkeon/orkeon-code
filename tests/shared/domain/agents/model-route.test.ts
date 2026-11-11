// Routing a crew to a profile: the ladder, the floors, what the decision model is asked and the profile read. Run:
//   node --test tests/shared/domain/agents/model-route.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import {
  ROUTE_BRIEF_CHARS, ladderOf, ladderProblem, parseRecords, parseRouteRules, routable, routeFloor, routeOf, routeOn, routeQuestions,
  routeState, withRecord,
} from "../../../../src/shared/domain/agents/model-route.ts";
import {
  FLOOR_CASES, LADDER, LADDER_CASES, LADDER_PROBLEM_CASES, LONG_BRIEF, ROUTABLE_CASES, ROUTE_CASES, RULES, RULES_TEXT_CASES, record,
} from "./model-route.fixtures.ts";

describe("routeOn", () => {
  for (const c of [{ value: "on", on: true }, { value: " On ", on: true }, { value: "off", on: false }, { value: undefined, on: false }]) {
    it(`reads ${JSON.stringify(c.value)} as ${c.on ? "on" : "off"}`, () => {
      // Arrange
      const value = c.value;

      // Act
      const on = routeOn(value);

      // Assert
      strictEqual(on, c.on);
    });
  }
});

describe("ladderOf", () => {
  for (const c of LADDER_CASES) {
    it(c.name, () => {
      // Arrange
      const value = c.value;

      // Act
      const ladder = ladderOf(value);

      // Assert
      deepStrictEqual(ladder, c.expected);
    });
  }
});

describe("ladderProblem", () => {
  for (const c of LADDER_PROBLEM_CASES) {
    it(c.name, () => {
      // Arrange
      const value = c.value;

      // Act
      const problem = ladderProblem(value);

      // Assert
      strictEqual(problem !== undefined, c.problem);
    });
  }
});

describe("parseRouteRules", () => {
  for (const c of RULES_TEXT_CASES) {
    it(c.name, () => {
      // Arrange
      const text = c.text;

      // Act
      const rules = parseRouteRules(text);

      // Assert
      deepStrictEqual(rules, c.expected);
    });
  }
});

describe("routeFloor", () => {
  for (const c of FLOOR_CASES) {
    it(c.name, () => {
      // Arrange
      const rules = RULES;

      // Act
      const floor = routeFloor(rules, c.crew, c.brief, LADDER);

      // Assert
      strictEqual(floor, c.floor);
    });
  }
});

describe("routeState", () => {
  it("names the crew and gives the command", () => {
    // Arrange
    const brief = " /review --lens security ";

    // Act
    const state = routeState("code-review", brief);

    // Assert
    strictEqual(state, "A coding assistant is about to run its crew 'code-review' for this command of its user:\n/review --lens security");
  });

  it("cuts a long command in its middle, at 4 000 characters", () => {
    // Arrange
    const brief = LONG_BRIEF;

    // Act
    const state = routeState("dev-change", brief);

    // Assert
    deepStrictEqual(
      [state.split("\n")[1].length, state.includes("aaa ... zzz"), state.endsWith("zzz")],
      [ROUTE_BRIEF_CHARS, true, true],
    );
  });
});

describe("routeQuestions", () => {
  it("asks one choice among the rungs, the first described as the cheapest and the last as the strongest", () => {
    // Arrange
    const ladder = LADDER;

    // Act
    const { profile } = routeQuestions(ladder);

    // Assert
    deepStrictEqual(
      [profile.type, Object.keys(profile.criteria), /cheapest/.test(String(Object.values(profile.criteria)[0])), /strongest/.test(String(Object.values(profile.criteria)[2]))],
      ["choice", ["small", "medium", "large"], true, true],
    );
  });
});

describe("routable", () => {
  for (const c of ROUTABLE_CASES) {
    it(c.name, () => {
      // Arrange
      const session = c.session;

      // Act
      const can = routable(session, LADDER);

      // Assert
      strictEqual(can, c.routable);
    });
  }
});

describe("routeOf", () => {
  for (const c of ROUTE_CASES) {
    it(c.name, () => {
      // Arrange
      const answers = c.answers;

      // Act
      const choice = routeOf(answers, LADDER, c.session, c.floor);

      // Assert
      deepStrictEqual(choice, c.expected);
    });
  }
});

describe("withRecord", () => {
  it("keeps the last 5 records", () => {
    // Arrange
    const records = [1, 2, 3, 4, 5].map(record);

    // Act
    const kept = withRecord(records, record(6));

    // Assert
    deepStrictEqual(kept.map((r) => r.crew), ["crew-2", "crew-3", "crew-4", "crew-5", "crew-6"]);
  });
});

describe("parseRecords", () => {
  for (const c of [
    { name: "reads the records a stored list holds", stored: JSON.stringify([record(1), { crew: 3 }]), count: 1 },
    { name: "reads none from a value that is not JSON", stored: "small", count: 0 },
    { name: "reads none from an absent value", stored: null, count: 0 },
  ]) {
    it(c.name, () => {
      // Arrange
      const stored = c.stored;

      // Act
      const records = parseRecords(stored);

      // Assert
      strictEqual(records.length, c.count);
    });
  }
});
