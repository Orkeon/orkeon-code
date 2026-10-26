// The close of a /dev-batches run: the merged files grouped by the pack's layout, the pull request's summary for the
// whole plan, and the close itself - the stops on a missing or default branch, the push, the pull request opened
// through the opener or handed over. Over FakeFiles, FakeShell, a config store and FakePullRequestOpener. Run:
//   node --test tests/crews/dev-batches/application/plan-close.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { closePlan, filesPerLayer, planSummary } from "../../../../src/crews/dev-batches/application/plan-close.ts";
import {
  BRANCH, DENIED_LINE, DENY_PUSH, LAYER_CASES, NO_BRANCH_LINE, ON_DEFAULT_LINE, PACK, PACK_WITH_BRANCH, PATHS, SUMMARY_CASES,
  WITH_ASSUMPTION, WORK_BRANCH_LINE, closeInput, closing, prAuto, pushRefused, pushedByHand,
} from "./plan-close.fixtures.ts";
import { assertClose } from "./plan-close.assertions.ts";
import { assertLineStarting, assertMentions } from "../../../support/assertions/text.ts";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";

describe("filesPerLayer", () => {
  for (const c of LAYER_CASES) {
    it(c.name, () => {
      // Arrange
      const paths = PATHS;

      // Act
      const layers = filesPerLayer(c.pack, paths);

      // Assert
      deepStrictEqual(layers, c.layers);
    });
  }
});

describe("planSummary", () => {
  for (const c of SUMMARY_CASES) {
    it(c.name, () => {
      // Arrange
      const input = c.input;

      // Act
      const summary = planSummary(input, []);

      // Assert
      strictEqual(summary.batch, c.batch);
    });
  }

  it("names each sheet's assumption after its batch", () => {
    // Arrange
    const input = closeInput({ dev: WITH_ASSUMPTION });

    // Act
    const summary = planSummary(input, []);

    // Assert
    deepStrictEqual(summary.assumptions, [{ id: "F1 A-01", assumption: "the store is local", by: "the sheet" }]);
  });
});

describe("closePlan — the stops", () => {
  it("stops without closing when no branch is checked out", async () => {
    // Arrange
    const world = closing("");

    // Act
    const close = await closePlan(world.deps, closeInput());

    // Assert
    deepStrictEqual(close, { closed: false, lines: [NO_BRANCH_LINE] });
  });

  it("stops on the default branch when the work branch the pack asks for exists", async () => {
    // Arrange
    const world = closing("main");

    // Act
    const close = await closePlan(world.deps, closeInput({ pack: PACK_WITH_BRANCH }));

    // Assert
    deepStrictEqual(close, { closed: false, lines: [WORK_BRANCH_LINE] });
  });

  it("closes on the default branch with no pull request when the pack asks for no work branch", async () => {
    // Arrange
    const world = closing("main");

    // Act
    const close = await closePlan(world.deps, closeInput({ pack: PACK }));

    // Assert
    deepStrictEqual(close, { closed: true, lines: [ON_DEFAULT_LINE] });
  });
});

describe("closePlan — the push and the pull request", () => {
  it("pushes the branch and opens the pull request through the opener under --pr", async () => {
    // Arrange
    const world = closing();

    // Act
    await closePlan(world.deps, closeInput({ pr: true }));

    // Assert
    deepStrictEqual(world.opener.opened.map((p) => ({ head: p.head, base: p.base, title: p.title })), [
      { head: BRANCH, base: "main", title: "feat(demo): demo" },
    ]);
  });

  it("opens the pull request when dev.prAuto is true", async () => {
    // Arrange
    const world = prAuto();

    // Act
    const close = await closePlan(world.deps, closeInput());

    // Assert
    assertClose(close, world.opener, { closed: true, opened: 1 });
  });

  it("hands the pull request's command over without --pr nor dev.prAuto", async () => {
    // Arrange
    const world = closing();

    // Act
    const close = await closePlan(world.deps, closeInput());

    // Assert
    assertLineStarting(close.lines, "to open the pull request, in a terminal:");
  });

  it("writes the pull request's body with the files of the merged commits", async () => {
    // Arrange
    const world = closing();

    // Act
    await closePlan(world.deps, closeInput());

    // Assert
    assertMentions(world.files.files.get(`${WORKSPACE}/workbench/pr-feat-demo/PR.md`) ?? "", ["src/domain/a.ts", "tests/a.test.ts"]);
  });

  it("takes a branch already on origin as pushed, without pushing it", async () => {
    // Arrange
    const world = pushedByHand();

    // Act
    const close = await closePlan(world.deps, closeInput());

    // Assert
    strictEqual(close.lines[0], `✓ ${BRANCH} is on origin already`);
  });

  it("keeps the commits local when a session rule denies the push", async () => {
    // Arrange
    const world = closing();

    // Act
    const close = await closePlan(world.deps, closeInput({ rules: DENY_PUSH }));

    // Assert
    strictEqual(close.lines[0], DENIED_LINE);
  });

  it("leaves the run open and opens no pull request when the push is refused", async () => {
    // Arrange
    const world = pushRefused();

    // Act
    const close = await closePlan(world.deps, closeInput({ pr: true }));

    // Assert
    assertClose(close, world.opener, { closed: false, opened: 0 });
  });

  it("closes and opens the pull request even when no batch was merged in the run", async () => {
    // Arrange
    const world = closing();

    // Act
    const close = await closePlan(world.deps, closeInput({ merged: [], pr: true }));

    // Assert
    assertClose(close, world.opener, { closed: true, opened: 1 });
  });
});
