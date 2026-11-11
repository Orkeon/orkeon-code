// The pruning of a turn's tool loop: its settings, what the decision model is asked and the verdicts. Run:
//   node --test tests/shared/domain/context-prune.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import {
  PRUNE_REQUEST_CHARS, dueForJudging, pressureSettings, pruneOn, pruneQuestions, pruneState, pruneTally, pruneVerdicts, worthJudging,
} from "../../../src/shared/domain/context-prune.ts";
import {
  LONG_REQUEST, MIXED_TALLY, MIXED_VERDICTS, ON_CASES, STATE_OF_ONE, THREE_CALLS, VERDICT_CASES, call,
  DUE_CASES,
} from "./context-prune.fixtures.ts";
import { assertStateHolds } from "./context-prune.assertions.ts";

describe("pruneOn", () => {
  for (const c of ON_CASES) {
    it(`reads ${JSON.stringify(c.value)} as ${c.on ? "on" : "off"}`, () => {
      // Arrange
      const value = c.value;

      // Act
      const on = pruneOn(value);

      // Assert
      strictEqual(on, c.on);
    });
  }
});

describe("pressureSettings", () => {
  it("asks from 40 % of the window, spares the last 6 messages and keeps 300 characters of a cut result", () => {
    // Arrange
    const window = 200_000;

    // Act
    const settings = pressureSettings(window);

    // Assert
    deepStrictEqual(settings, { thresholdTokens: 80_000, keepRecent: 6, headChars: 300 });
  });
});

describe("worthJudging", () => {
  it("leaves a result of 600 characters out of the judgement", () => {
    // Arrange
    const small = call(1, 600);

    // Act
    const worth = worthJudging(small);

    // Assert
    strictEqual(worth, false);
  });

  it("judges a result of 601 characters", () => {
    // Arrange
    const large = call(1, 601);

    // Act
    const worth = worthJudging(large);

    // Assert
    strictEqual(worth, true);
  });
});

describe("dueForJudging", () => {
  for (const c of DUE_CASES) {
    it(c.name, () => {
      // Arrange
      const offered = call(1, 12_000, { age: c.age });

      // Act
      const due = dueForJudging(offered, c.keptAtAge);

      // Assert
      strictEqual(due, c.due);
    });
  }
});

describe("pruneState", () => {
  it("gives the request, then each call with its number, tool, input, size and age", () => {
    // Arrange
    const calls = [call(1)];

    // Act
    const state = pruneState(" Rename the port ", calls);

    // Assert
    strictEqual(state, STATE_OF_ONE);
  });

  it("cuts a request at 2 000 characters", () => {
    // Arrange
    const request = LONG_REQUEST;

    // Act
    const state = pruneState(request, []);

    // Assert
    assertStateHolds(state, `${LONG_REQUEST.slice(0, PRUNE_REQUEST_CHARS)}...\n`);
  });

  it("cuts a call's input at 200 characters", () => {
    // Arrange
    const calls = [call(1, 12_000, { input: { pattern: "p".repeat(400) } })];

    // Act
    const state = pruneState("r", calls);

    // Assert
    assertStateHolds(state, `file_read {"pattern":"${"p".repeat(188)}..., a result`);
  });
});

describe("pruneQuestions", () => {
  it("asks two yes/no questions per call, named by the call's number", () => {
    // Arrange
    const calls = THREE_CALLS;

    // Act
    const questions = pruneQuestions(calls);

    // Assert
    deepStrictEqual(
      Object.entries(questions).map(([name, q]) => `${name}:${q.type}`),
      ["needed_1:noul", "whole_1:noul", "needed_2:noul", "whole_2:noul", "needed_3:noul", "whole_3:noul"],
    );
  });
});

describe("pruneVerdicts", () => {
  for (const c of VERDICT_CASES) {
    it(c.name, () => {
      // Arrange
      const answers = c.answers;

      // Act
      const verdicts = pruneVerdicts(THREE_CALLS, answers);

      // Assert
      deepStrictEqual(verdicts, c.expected);
    });
  }
});

describe("pruneTally", () => {
  it("counts what was judged, removed and cut, and the tokens freed", () => {
    // Arrange
    const verdicts = MIXED_VERDICTS;

    // Act
    const tally = pruneTally(THREE_CALLS, verdicts);

    // Assert
    deepStrictEqual(tally, MIXED_TALLY);
  });
});
