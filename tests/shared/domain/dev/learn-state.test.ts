// The /dev-learn state: Orkeon Code's own file and the harness's, read only. Run:
//   node --test src/shared/domain/dev/learn-state.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";

import {
  HARNESS_LEARN_STATE_FILE, LEARN_STATE_FILE, decisionOf, emptyLearnState, parseHarnessLearnState, parseLearnState,
  serializeLearnState, withDecision,
} from "../../../../src/shared/domain/dev/learn-state.ts";
import {
  ACCEPT, acceptedState, ADDED_ROWS, fullState, REFUSE, startState, UNREADABLE_HARNESS, WRONG_SHAPES,
} from "./learn-state.fixtures.ts";
import { assertNotJsonProblem } from "./learn-state.assertions.ts";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";

describe("learn state files", () => {
  it(`names the two state files relative to ${WORKSPACE}`, () => {
    // Arrange
    const expected = [".orkeon/dev-learn-state.json", ".claude/local/dev-learn-state.json"];

    // Act
    const [own, harness] = [LEARN_STATE_FILE, HARNESS_LEARN_STATE_FILE];

    // Assert
    strictEqual(own, expected[0]);
    strictEqual(harness, expected[1]);
  });
});

describe("parseLearnState", () => {
  it("an absent file reads as the empty state", () => {
    // Arrange
    const text = null;

    // Act
    const r = parseLearnState(text);

    // Assert
    deepStrictEqual(r, { ok: true, state: { version: 1, treated: [], decisions: [] } });
  });

  it("the empty state holds version 1, nothing treated, no decision", () => {
    // Arrange
    const expected = { version: 1, treated: [], decisions: [] };

    // Act
    const state = emptyLearnState();

    // Assert
    deepStrictEqual(state, expected);
  });

  it("invalid JSON is a problem naming the file and the parser's first line, never an empty state", () => {
    // Arrange
    const text = "{ not json";

    // Act
    const r = parseLearnState(text);

    // Assert
    assertNotJsonProblem(r);
  });

  for (const c of WRONG_SHAPES) {
    it(`each wrong shape names its field: ${c.field} in ${c.text}`, () => {
      // Arrange
      const { text } = c;

      // Act
      const r = parseLearnState(text);

      // Assert
      deepStrictEqual(r, { ok: false, problem: `.orkeon/dev-learn-state.json: ${c.field} has the wrong shape` }, text);
    });
  }

  it("serializes one-space indented with a final line break", () => {
    // Arrange
    const state = fullState();

    // Act
    const text = serializeLearnState(state);

    // Assert
    strictEqual(text, JSON.stringify(state, null, 1) + "\n");
  });

  it("round trips through serializeLearnState", () => {
    // Arrange
    const state = fullState();
    const text = serializeLearnState(state);

    // Act
    const r = parseLearnState(text);

    // Assert
    deepStrictEqual(r, { ok: true, state });
  });
});

describe("withDecision and decisionOf", () => {
  it("adds the rows to treated, sorted and unique, and records the decision", () => {
    // Arrange
    const start = startState();

    // Act
    const next = withDecision(start, ACCEPT, ADDED_ROWS);

    // Assert
    deepStrictEqual(next.treated, ["0b1c2d3e4f", "68abc1ec48", "9a8b7c6d5e"]);
    deepStrictEqual(next.decisions, [ACCEPT]);
    deepStrictEqual(start.treated, ["9a8b7c6d5e", "0b1c2d3e4f"], "the input state is not changed");
  });

  it("decisionOf finds the decision recorded on a motif", () => {
    // Arrange
    const next = acceptedState();

    // Act
    const decision = decisionOf(next, "3f2a9c1e");

    // Assert
    deepStrictEqual(decision, ACCEPT);
  });

  it("decisionOf finds nothing on a motif not decided", () => {
    // Arrange
    const next = acceptedState();

    // Act
    const decision = decisionOf(next, "77b0d2aa");

    // Assert
    strictEqual(decision, undefined);
  });

  it("a second decision on the same motif replaces the first", () => {
    // Arrange
    const once = withDecision(withDecision(emptyLearnState(), ACCEPT, []), REFUSE, []);

    // Act
    const twice = withDecision(once, { ...ACCEPT, decision: "refused" }, []);

    // Assert
    deepStrictEqual(twice.decisions, [REFUSE, { ...ACCEPT, decision: "refused" }]);
  });
});

describe("parseHarnessLearnState", () => {
  it("reads both lists and drops non-string items", () => {
    // Arrange
    const text = `{"treated":["68abc1ec48",4,null],"refused":["Batches too wide"],"x":1}`;

    // Act
    const state = parseHarnessLearnState(text);

    // Assert
    deepStrictEqual(state, { treated: ["68abc1ec48"], refused: ["Batches too wide"] });
  });

  for (const text of UNREADABLE_HARNESS) {
    it(`anything unreadable or of the wrong shape counts as empty lists: ${JSON.stringify(text)}`, () => {
      // Arrange
      const empty = { treated: [], refused: [] };

      // Act
      const state = parseHarnessLearnState(text);

      // Assert
      deepStrictEqual(state, empty, String(text));
    });
  }

  it("a list of the wrong shape counts as empty, the other kept", () => {
    // Arrange
    const text = `{"treated":3,"refused":["a"]}`;

    // Act
    const state = parseHarnessLearnState(text);

    // Assert
    deepStrictEqual(state, { treated: [], refused: ["a"] });
  });
});
