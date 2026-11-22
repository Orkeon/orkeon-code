// Routing a crew to a profile: the ladder, the floors, what the runtime's pick is given and what is kept of it. Run:
//   node --test tests/shared/domain/agents/model-route.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import {
  asOnLadder, ladderOf, ladderProblem, parseRecords, parseRouteRules, routable, routeBounds, routeDecided, routeFloor, routeHeld, routeNotAsked,
  routeOn, routeState, withRecord,
} from "../../../../src/shared/domain/agents/model-route.ts";
import {
  BOUNDS_CASES, DECIDED_REASONS, FLOOR_CASES, HELD_CASES, LADDER, LADDER_CASES, LADDER_PROBLEM_CASES, LONG_BRIEF, NOT_ASKED_REASONS, OLD_RECORD, ROOT_RULES,
  ROUTABLE_CASES, RULES, RULES_TEXT_CASES, SPELLING_CASES, record,
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

describe("routeFloor, a rule on the root", () => {
  it("ignores a rule whose path is the workspace itself", () => {
    // Arrange
    const rules = ROOT_RULES;

    // Act
    const floor = routeFloor(rules, "project-init", "/init", LADDER);

    // Assert
    strictEqual(floor, 0);
  });
});

describe("routeState", () => {
  it("names the crew and gives the command", () => {
    // Arrange
    const brief = " /review --lens security ";

    // Act
    const state = routeState("code-review", brief);

    // Assert
    strictEqual(state, "Run the crew 'code-review' of a coding assistant for this command of its user:\n/review --lens security");
  });

  it("gives a long command whole, the cut being the runtime's", () => {
    // Arrange
    const brief = LONG_BRIEF;

    // Act
    const state = routeState("dev-change", brief);

    // Assert
    strictEqual(state.split("\n")[1], LONG_BRIEF);
  });
});

describe("routeHeld", () => {
  for (const c of HELD_CASES) {
    it(c.name, () => {
      // Arrange
      const session = c.session;

      // Act
      const held = routeHeld(LADDER, session, c.floor);

      // Assert
      strictEqual(held, c.held);
    });
  }
});

describe("asOnLadder", () => {
  for (const c of SPELLING_CASES) {
    it(c.name, () => {
      // Arrange
      const profile = c.profile;

      // Act
      const spelled = asOnLadder(LADDER, profile);

      // Assert
      strictEqual(spelled, c.expected);
    });
  }
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

describe("routeBounds", () => {
  for (const c of BOUNDS_CASES) {
    it(c.name, () => {
      // Arrange
      const floor = c.floor;

      // Act
      const bounds = routeBounds(LADDER, c.session, floor);

      // Assert
      deepStrictEqual(bounds, c.expected);
    });
  }
});

describe("routeDecided", () => {
  for (const c of DECIDED_REASONS) {
    it(c.name, () => {
      // Arrange
      const reason = c.reason;

      // Act
      const decided = routeDecided(reason);

      // Assert
      strictEqual(decided, c.decided);
    });
  }
});

describe("routeNotAsked", () => {
  for (const c of NOT_ASKED_REASONS) {
    it(c.name, () => {
      // Arrange
      const reason = c.reason;

      // Act
      const notAsked = routeNotAsked(reason);

      // Assert
      strictEqual(notAsked, c.notAsked);
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

describe("parseRecords, a record whose reason no choice carries", () => {
  for (const reason of ["circuit-off", "no-ladder", "guess"]) {
    it(`drops a record kept with the reason ${reason}`, () => {
      // Arrange
      const stored = JSON.stringify([{ crew: "dev-plan", profile: "large", reason }]);

      // Act
      const records = parseRecords(stored);

      // Assert
      deepStrictEqual(records, []);
    });
  }
});

describe("parseRecords, a record kept before the runtime's pick", () => {
  it("reads its confidence as the probability", () => {
    // Arrange
    const stored = JSON.stringify([OLD_RECORD]);

    // Act
    const records = parseRecords(stored);

    // Assert
    deepStrictEqual(records, [{ crew: "dev-plan", profile: "small", reason: "model", picked: "small", probability: 0.9 }]);
  });
});
