// Review inputs the scope is resolved from, for the resolveReviewScope tests.

/** Inputs that name no file: each keeps the bare staged range. */
export const ABSENT_FILES_INPUTS: readonly { name: string; inputs: unknown }[] = [
  { name: "no input field", inputs: {} },
  { name: "an empty file list", inputs: { files: [] } },
  { name: "an undefined file list", inputs: { files: undefined } },
  { name: "a null file list", inputs: { files: null } },
  { name: "no inputs at all", inputs: undefined },
];

/** The two input shapes of the range: no commit, a named commit. */
export const RANGE_INPUTS: readonly { name: string; inputs: Record<string, unknown> }[] = [
  { name: "no commit", inputs: {} },
  { name: "a named commit", inputs: { commit: "abc123" } },
];

/** A scope and what its description must mention. */
export const DESCRIBED_SCOPES: readonly { name: string; inputs: Record<string, unknown>; mentions: string }[] = [
  { name: "the staged changes", inputs: {}, mentions: "staged" },
  { name: "the named paths", inputs: { files: ["a.ts"] }, mentions: "a.ts" },
  { name: "the commit range", inputs: { commit: "abc" }, mentions: "abc~1..abc" },
];

/** Paths carrying shell metacharacters, after one safe path. */
export const UNSAFE_PATHS = ["ok.ts", "a.ts; cat /etc/passwd", "b$(id).ts", "c`id`.ts", "d|e.ts"];

/** Path shapes a real review needs. */
export const REAL_PATHS = ["a.ts", "src/deep/nested-file.test.ts", "shared/domain/types.ts", "a.b.c-d_e/f.ts"];

/** Ref shapes a real review needs. */
export const REAL_REFS: readonly string[] = ["abc1234", "HEAD", "HEAD~3", "v1.2.3", "feature/x", "origin/main", "HEAD^"];
