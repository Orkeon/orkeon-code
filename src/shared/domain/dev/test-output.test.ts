import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";
import { failedTests } from "./test-output.ts";

describe("failedTests", () => {
  it("names the failed tests of a TAP run once each, directives dropped", () => {
    const tap = [
      "TAP version 13", "# Subtest: sums a list", "ok 1 - sums a list", "not ok 2 - averages a list",
      "  ---", "  error: 'x'", "  ...", "not ok 3 - refuses the mean of an empty list # TODO later",
      "    not ok 1 - averages a list", "1..3", "# fail 2",
    ].join("\n");
    deepStrictEqual(failedTests(tap), ["averages a list", "refuses the mean of an empty list"]);
  });

  it("reads pytest, dotnet, go, jest and vitest lines, and nothing from their chatter", () => {
    deepStrictEqual(failedTests("FAILED tests/test_a.py::test_mean - AssertionError\nPASSED tests/test_a.py::test_sum"), ["tests/test_a.py::test_mean"]);
    deepStrictEqual(failedTests("  Failed Calc.Tests.MeanTests.Empty [12 ms]\nFailed!  - Failed: 1, Passed: 3\nFailed to load x"), ["Calc.Tests.MeanTests.Empty"]);
    deepStrictEqual(failedTests("--- FAIL: TestMean (0.00s)\n--- PASS: TestSum (0.00s)"), ["TestMean"]);
    deepStrictEqual(failedTests("  ✓ sums (1 ms)\n  ✕ averages a list (2 ms)\n  × refuses"), ["averages a list", "refuses"]);
  });

  it("stops at 20 names of 120 characters, and lists none for a green run", () => {
    const many = Array.from({ length: 30 }, (_, i) => `not ok ${i + 1} - t${i}`).join("\n");
    strictEqual(failedTests(many).length, 20);
    strictEqual(failedTests(`not ok 1 - ${"n".repeat(200)}`)[0].length, 120);
    deepStrictEqual(failedTests("ok 1 - sums\n1..1\n# pass 1\n# fail 0"), []);
  });
});
