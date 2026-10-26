// Test run outputs failedTests is tested on, one per format the packs run.

/** A node:test TAP run: one pass, two failures (one with a directive), a subtest's nested `not ok` repeating one. */
export const TAP_RUN = [
  "TAP version 13",
  "# Subtest: sums a list",
  "ok 1 - sums a list",
  "not ok 2 - averages a list",
  "  ---",
  "  error: 'x'",
  "  ...",
  "not ok 3 - refuses the mean of an empty list # TODO later",
  "    not ok 1 - averages a list",
  "1..3",
  "# fail 2",
].join("\n");

export interface FormatCase {
  format: string;
  output: string;
  failed: string[];
}

/** One run per other format, its chatter (a summary, a passing line) beside the failure it names. */
export const OTHER_FORMATS: readonly FormatCase[] = [
  {
    format: "pytest",
    output: "FAILED tests/test_a.py::test_mean - AssertionError\nPASSED tests/test_a.py::test_sum",
    failed: ["tests/test_a.py::test_mean"],
  },
  {
    format: "dotnet",
    output: "  Failed Calc.Tests.MeanTests.Empty [12 ms]\nFailed!  - Failed: 1, Passed: 3\nFailed to load x",
    failed: ["Calc.Tests.MeanTests.Empty"],
  },
  { format: "go", output: "--- FAIL: TestMean (0.00s)\n--- PASS: TestSum (0.00s)", failed: ["TestMean"] },
  {
    format: "jest and vitest",
    output: "  ✓ sums (1 ms)\n  ✕ averages a list (2 ms)\n  × refuses",
    failed: ["averages a list", "refuses"],
  },
];

/** A TAP run with `count` failures named t0, t1, ... */
export function tapRunFailing(count: number): string {
  return Array.from({ length: count }, (_, i) => `not ok ${i + 1} - t${i}`).join("\n");
}

/** A TAP run whose one failure has a name of `length` characters. */
export function tapRunWithLongName(length: number): string {
  return `not ok 1 - ${"n".repeat(length)}`;
}

export const GREEN_TAP_RUN = "ok 1 - sums\n1..1\n# pass 1\n# fail 0";
