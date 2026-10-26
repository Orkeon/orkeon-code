// B-3 — the `files` input was declared and dead. Run:
//   node --test src/crews/code-review/domain/scope.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual, ok } from "node:assert";
import { resolveCommitRange, resolveReviewScope } from "../../../../src/crews/code-review/domain/scope.ts";
import {
  ABSENT_FILES_INPUTS, DESCRIBED_SCOPES, RANGE_INPUTS, REAL_PATHS, REAL_REFS, UNSAFE_PATHS,
} from "./scope.fixtures.ts";
import { assertBareStagedScope, assertReasonsMention } from "./scope.assertions.ts";

describe("resolveReviewScope — ACCEPTANCE 2: absent files keeps today's behaviour", () => {
  for (const c of ABSENT_FILES_INPUTS) {
    it(`produces the bare range, byte-identical to the pre-B-3 commands, for ${c.name}`, () => {
      // Arrange
      const inputs = c.inputs;

      // Act
      const s = resolveReviewScope(inputs);

      // Assert
      assertBareStagedScope(s, JSON.stringify(inputs));
    });
  }

  for (const c of RANGE_INPUTS) {
    it(`agrees with resolveCommitRange on the range, for ${c.name}`, () => {
      // Arrange
      const expected = resolveCommitRange(c.inputs);

      // Act
      const s = resolveReviewScope(c.inputs);

      // Assert
      strictEqual(s.range, expected);
    });
  }

  it("keeps the commit range shape", () => {
    // Arrange
    const inputs = { commit: "abc123" };

    // Act
    const s = resolveReviewScope(inputs);

    // Assert
    strictEqual(s.diffArgs, "abc123~1..abc123");
  });
});

describe("resolveReviewScope — ACCEPTANCE 1: files restricts the diff", () => {
  it("appends the pathspec after a `--` separator", () => {
    // Arrange
    const inputs = { files: ["src/a.ts", "src/b.ts"] };

    // Act
    const s = resolveReviewScope(inputs);

    // Assert
    strictEqual(s.diffArgs, "--staged -- src/a.ts src/b.ts");
    deepStrictEqual(s.paths, ["src/a.ts", "src/b.ts"]);
  });

  it("needs the `--`, or git would resolve a path that looks like a ref", () => {
    // Arrange
    const inputs = { files: ["main"] };

    // Act
    const s = resolveReviewScope(inputs);

    // Assert
    ok(s.diffArgs.includes(" -- main"));
  });

  it("combines with a named commit", () => {
    // Arrange
    const inputs = { commit: "deadbee", files: ["a.ts"] };

    // Act
    const s = resolveReviewScope(inputs);

    // Assert
    strictEqual(s.diffArgs, "deadbee~1..deadbee -- a.ts");
  });

  it("accepts a single string as well as an array", () => {
    // Arrange
    const inputs = { files: "a.ts" };

    // Act
    const s = resolveReviewScope(inputs);

    // Assert
    deepStrictEqual(s.paths, ["a.ts"]);
  });

  it("deduplicates and drops blanks without complaining", () => {
    // Arrange
    const inputs = { files: ["a.ts", "a.ts", "", "   "] };

    // Act
    const s = resolveReviewScope(inputs);

    // Assert
    deepStrictEqual(s.paths, ["a.ts"]);
    deepStrictEqual(s.rejected, [], "a blank is noise, not a rejected request");
  });

  for (const c of DESCRIBED_SCOPES) {
    it(`describes the scope, so the report header can state what was reviewed: ${c.name}`, () => {
      // Arrange
      const inputs = c.inputs;

      // Act
      const s = resolveReviewScope(inputs);

      // Assert
      ok(s.describe.includes(c.mentions), s.describe);
    });
  }
});

describe("resolveReviewScope — shell safety, and never a silent drop", () => {
  // `sh()` passes its command string through verbatim, so both inputs land in a
  // shell. `commit` was already an injection point before B-3; `files` would have
  // been a second one.
  it("refuses a commit ref carrying shell metacharacters, and says so", () => {
    // Arrange
    const inputs = { commit: "x; rm -rf /" };

    // Act
    const s = resolveReviewScope(inputs);

    // Assert
    strictEqual(s.diffArgs, "--staged", "falls back to the safe default");
    strictEqual(s.rejected.length, 1);
    strictEqual(s.rejected[0].value, "x; rm -rf /");
    ok(s.rejected[0].reason.includes("git ref"), s.rejected[0].reason);
  });

  it("refuses paths carrying shell metacharacters", () => {
    // Arrange
    const inputs = { files: UNSAFE_PATHS };

    // Act
    const s = resolveReviewScope(inputs);

    // Assert
    deepStrictEqual(s.paths, ["ok.ts"], "only the safe path survives");
    strictEqual(s.rejected.length, 4);
    assertReasonsMention(s.rejected, "unsafe");
  });

  it("refuses a path with whitespace — it would split into two arguments", () => {
    // Arrange
    const inputs = { files: ["my file.ts"] };

    // Act
    const s = resolveReviewScope(inputs);

    // Assert
    deepStrictEqual(s.paths, []);
    strictEqual(s.rejected.length, 1);
  });

  it("refuses an absolute path and a '..' escape", () => {
    // Arrange
    const inputs = { files: ["/etc/passwd", "../../secrets.env", "a/../b.ts"] };

    // Act
    const s = resolveReviewScope(inputs);

    // Assert
    deepStrictEqual(s.paths, []);
    strictEqual(s.rejected.length, 3);
    ok(s.rejected[0].reason.includes("repo-relative"), s.rejected[0].reason);
    ok(s.rejected[1].reason.includes("escape the repository"), s.rejected[1].reason);
  });

  it("REPORTS every rejection — a dropped path is the defect B-3 fixes", () => {
    // Silently ignoring `files` is exactly what shipped. A rejected path must
    // therefore be louder than an accepted one, not quieter.
    // Arrange
    const inputs = { files: ["bad;path.ts"] };

    // Act
    const s = resolveReviewScope(inputs);

    // Assert
    strictEqual(s.paths.length, 0);
    strictEqual(s.rejected.length, 1);
    ok(s.rejected[0].value.length > 0);
    ok(s.rejected[0].reason.length > 0);
  });

  it("accepts the path shapes a real review needs", () => {
    // Arrange
    const files = REAL_PATHS;

    // Act
    const s = resolveReviewScope({ files });

    // Assert
    deepStrictEqual(s.paths, files);
  });

  for (const ref of REAL_REFS) {
    it(`accepts the ref shape ${ref} a real review needs`, () => {
      // Arrange
      const inputs = { commit: ref };

      // Act
      const s = resolveReviewScope(inputs);

      // Assert
      strictEqual(s.rejected.length, 0, ref);
    });
  }
});
