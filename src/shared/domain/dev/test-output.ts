// The failed tests a test run's output names. Listed in the run_tests result, they tell a role which tests
// failed without a read of the log: the test author checks that the new tests are the red ones from the
// result alone. Pure.

const MAX_FAILED = 20;
const MAX_NAME = 120;

/** One failed test per line, in the formats the packs run: TAP (`not ok 3 - name`, node:test, tap, prove), pytest
 *  (`FAILED tests/test_a.py::test_mean - …`), dotnet (`Failed Ns.Class.Method [12 ms]`), go (`--- FAIL: TestName`),
 *  jest and vitest (`✕ name (2 ms)`). */
const FAILED_LINES: readonly RegExp[] = [
  /^\s*not ok \d+(?: - | )(.+?)\s*(?:#.*)?$/u,
  /^\s*FAILED\s+(\S+)/u,
  /^\s*Failed\s+(\S+)\s*\[[^\]]*\]\s*$/u,
  /^\s*--- FAIL: (\S+)/u,
  /^\s*[✕✗×]\s+(.+?)\s*(?:\(\d+ ?m?s\))?$/u,
];

/** The failed tests `output` names, each once, in order, at most 20 of 120 characters; empty when it names none. */
export function failedTests(output: string): string[] {
  const out = new Set<string>();
  for (const line of output.split(/\r?\n/u)) {
    for (const re of FAILED_LINES) {
      const m = re.exec(line);
      if (m !== null) {
        out.add(m[1].trim().slice(0, MAX_NAME));
        break;
      }
    }
    if (out.size >= MAX_FAILED) break;
  }
  return [...out];
}
