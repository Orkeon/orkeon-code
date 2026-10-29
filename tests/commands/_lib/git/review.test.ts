// /review and its aliases (commands/_lib/git/review.ts): the line each name reads, /passes over
// FakeSessionStore, and the refusal of a review while one runs, over FakeRunningCrews. Run:
//   node --test tests/commands/_lib/git/review.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { invalidPassesText, parseReviewArgs, reviewBusyText, runPasses } from "../../../../src/commands/_lib/git/review.ts";
import { PASSES_STATE_KEY } from "../../../../src/shared/domain/session-keys.ts";
import { FakeRunningCrews } from "../../../support/doubles/fake-running-crews.ts";
import { FakeSessionStore } from "../../../support/doubles/fake-session-store.ts";
import { BUSY_CASES, ROUTE_CASES, SET_THREE, SHOW_DEFAULT } from "./review.fixtures.ts";
import { assertPassesAnswered } from "./review.assertions.ts";

describe("parseReviewArgs", () => {
  for (const c of ROUTE_CASES) {
    it(c.name, () => {
      // Arrange
      const tokens = c.tokens;

      // Act
      const route = parseReviewArgs(tokens, c.typed);

      // Assert
      deepStrictEqual(route, c.expected);
    });
  }
});

describe("/passes — runPasses", () => {
  it("shows the default count when the session holds none", async () => {
    // Arrange
    const session = new FakeSessionStore();

    // Act
    const view = await runPasses("", { session });

    // Assert
    deepStrictEqual(view, { text: SHOW_DEFAULT });
  });

  it("shows the count the session holds", async () => {
    // Arrange
    const session = new FakeSessionStore();
    session.state.set(PASSES_STATE_KEY, "4");

    // Act
    const view = await runPasses("", { session });

    // Assert
    strictEqual(view.text?.split("\n")[0], "reasoning passes: 4");
  });

  it("sets the session count and says the lens calls it costs", async () => {
    // Arrange
    const session = new FakeSessionStore();

    // Act
    const view = await runPasses("3", { session });

    // Assert
    assertPassesAnswered(view, session.state.get(PASSES_STATE_KEY), SET_THREE, "3");
  });

  it("refuses a count out of 1-5 and keeps the session's", async () => {
    // Arrange
    const session = new FakeSessionStore();

    // Act
    const view = await runPasses("0", { session });

    // Assert
    assertPassesAnswered(view, session.state.get(PASSES_STATE_KEY), invalidPassesText("0"), undefined);
  });
});

describe("reviewBusyText", () => {
  for (const c of BUSY_CASES) {
    it(c.name, () => {
      // Arrange
      const running = new FakeRunningCrews();
      running.tickets = c.tickets;

      // Act
      const text = reviewBusyText(running);

      // Assert
      strictEqual(text, c.expected);
    });
  }
});
