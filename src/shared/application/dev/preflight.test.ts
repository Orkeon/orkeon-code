// The preflight of /dev-batches over a scripted shell: each check's line, the ✗ that stops a run and
// the ⚠ that does not. Run:
//   node --test src/shared/application/dev/preflight.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { preflight } from "./preflight.ts";
import {
  changedTreeShell, gitShell, INPUT, MISSING_SHEET_AND_CYCLE, noIdentityDetachedShell, PASSED_LINES, UNREADABLE_PLANS,
} from "./preflight.fixtures.ts";
import { assertLineStarting, assertLinesStarting } from "./preflight.assertions.ts";

describe("preflight", () => {
  it("passes a readable plan, its sheets, an order, an identity and a branch", async () => {
    // Arrange
    const shell = gitShell();

    // Act
    const r = await preflight({ shell }, INPUT);

    // Assert
    strictEqual(r.ok, true);
    deepStrictEqual(r.lines, PASSED_LINES);
  });

  it("fails on a missing sheet, a cycle, no identity and a detached HEAD", async () => {
    // Arrange
    const shell = noIdentityDetachedShell();

    // Act
    const r = await preflight({ shell }, MISSING_SHEET_AND_CYCLE);

    // Assert
    strictEqual(r.ok, false);
    assertLinesStarting(r.lines, "preflight ✗", 4);
    ok(r.lines.includes("preflight ✗ sheets: no sheet for F3"), r.lines.join("\n"));
    assertLineStarting(r.lines, "preflight ✗ git identity:", "git config user.name and user.email in the repository");
  });

  it("warns, without failing, on changes outside the work folder and .orkeon/", async () => {
    // Arrange
    const shell = changedTreeShell();

    // Act
    const r = await preflight({ shell }, INPUT);

    // Assert
    strictEqual(r.ok, true);
    assertLineStarting(r.lines, "preflight ⚠ tree: 1 change(s) outside the work folder (src/a.ts)");
  });

  for (const c of UNREADABLE_PLANS) {
    it(`fails ${c.name}`, async () => {
      // Arrange
      const shell = gitShell();

      // Act
      const r = await preflight({ shell }, c.input);

      // Assert
      strictEqual(r.ok, false);
    });
  }
});
