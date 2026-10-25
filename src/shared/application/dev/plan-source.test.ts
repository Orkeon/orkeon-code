// Unit tests for resolving and reading the source of a plan, over FakeFiles. Run:
//   node --test src/shared/application/dev/plan-source.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { MAX_SOURCE_CHARS, readPlanSource, resolvePlanSource } from "./plan-source.ts";
import {
  longTrimSpec, NOT_SOURCES, REFUSED_CODES, setup, source, SOURCE_PATHS, TRIM_SOURCE, UNDER_CLAUDE, unreadableTrimSpec,
  WORK, WORK_OUTSIDE,
} from "./plan-source.fixtures.ts";
import { assertRefused } from "./plan-source.assertions.ts";

describe("resolvePlanSource with no token", () => {
  it("takes the one code with a spec or a brief and no plan", async () => {
    // Arrange
    const files = setup({ done: ["SPEC-done.md", "DONE-PLAN.md"], trim: ["SPEC-trim.md"], notes: ["x.txt"] });

    // Act
    const r = await resolvePlanSource(files, WORK, null);

    // Assert
    deepStrictEqual(r, { ok: true, source: source("spec", "trim", "workbench/trim", "SPEC-trim.md") });
  });

  it("refuses when no code could be planned", async () => {
    // Arrange
    const files = setup({ done: ["CHANGE-done.md", "DONE-PLAN.md"] });

    // Act
    const r = await resolvePlanSource(files, WORK, null);

    // Assert
    assertRefused(r, "dev-plan: no SPEC- or CHANGE- file without a plan in workbench/: name one, e.g. /dev-plan <code>");
  });

  it("refuses when several codes could be planned, naming them", async () => {
    // Arrange
    const files = setup({ alpha: ["SPEC-alpha.md"], beta: ["CHANGE-beta.md"] });

    // Act
    const r = await resolvePlanSource(files, WORK, null);

    // Assert
    assertRefused(r, "dev-plan: several codes could be planned (alpha, beta): name one, e.g. /dev-plan alpha");
  });
});

describe("resolvePlanSource with a code", () => {
  it("finds the brief of the code folder", async () => {
    // Arrange
    const files = setup({ slow: ["CHANGE-slow.md", "notes.md"] });

    // Act
    const r = await resolvePlanSource(files, WORK, "slow");

    // Assert
    deepStrictEqual(r, { ok: true, source: source("change", "slow", "workbench/slow", "CHANGE-slow.md") });
  });

  for (const c of REFUSED_CODES) {
    it(`refuses ${c.name}`, async () => {
      // Arrange
      const files = setup(c.codes);

      // Act
      const r = await resolvePlanSource(files, WORK, c.token);

      // Assert
      assertRefused(r, c.text);
    });
  }
});

describe("resolvePlanSource with a path", () => {
  for (const c of SOURCE_PATHS) {
    it(`takes ${c.name}, its parent as the folder`, async () => {
      // Arrange
      const files = setup();

      // Act
      const r = await resolvePlanSource(files, WORK, c.token);

      // Assert
      deepStrictEqual(r, { ok: true, source: c.source });
    });
  }

  for (const token of NOT_SOURCES) {
    it(`refuses '${token}', neither a code nor a source path`, async () => {
      // Arrange
      const files = setup();

      // Act
      const r = await resolvePlanSource(files, WORK, token);

      // Assert
      assertRefused(r, `dev-plan: '${token}' is neither a code nor a SPEC-<code>.md / CHANGE-<code>.md path`);
    });
  }

  for (const token of UNDER_CLAUDE) {
    it(`refuses the source ${token} under .claude/`, async () => {
      // Arrange
      const files = setup();

      // Act
      const r = await resolvePlanSource(files, WORK, token);

      // Assert
      assertRefused(r, "dev-plan: a source under .claude/ is the harness's own: copy it to the work folder first");
    });
  }
});

describe("resolvePlanSource outside the mounts", () => {
  it("refuses a work folder with no virtual path", async () => {
    // Arrange
    const files = setup();

    // Act
    const r = await resolvePlanSource(files, WORK_OUTSIDE, "trim");

    // Assert
    assertRefused(r, "dev-plan: the work folder /home/dev/repo/workbench is outside /workspace: run /dev-plan from the main worktree");
  });
});

describe("readPlanSource", () => {
  it("reads and parses the source, at most MAX_SOURCE_CHARS characters", async () => {
    // Arrange
    const files = longTrimSpec();

    // Act
    const r = await readPlanSource(files, TRIM_SOURCE);

    // Assert
    strictEqual(r.ok && r.text.length, MAX_SOURCE_CHARS);
    deepStrictEqual(r.ok && r.parsed.ids.map((i) => i.id), ["UC-01"]);
    strictEqual(r.ok && r.parsed.code, "trim");
  });

  it("gives the refusal text with the first line of the error", async () => {
    // Arrange
    const files = unreadableTrimSpec();

    // Act
    const r = await readPlanSource(files, TRIM_SOURCE);

    // Assert
    deepStrictEqual(r, { ok: false, text: "dev-plan: workbench/trim/SPEC-trim.md cannot be read (permission denied)" });
  });
});
