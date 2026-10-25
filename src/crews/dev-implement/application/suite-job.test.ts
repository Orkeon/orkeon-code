// The build or suite as a shell job. Run:
//   node --test src/crews/dev-implement/application/suite-job.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { FakeFiles } from "../../../../tests/support/doubles/fake-files.ts";
import { FakeShell } from "../../../../tests/support/doubles/fake-shell.ts";
import { logText, runSuite } from "./suite-job.ts";
import {
  jobsFailingAfterFirstLook, jobsFailingFirstLook, jobsRunningFor, jobsThatCannotWait, jobsThatDoNotStart, LOG_TEXT_CASES, REQ,
  suiteJobs, suiteShell,
} from "./suite-job.fixtures.ts";
import { assertPassedTail, assertRunningUnread, assertSuiteLog } from "./suite-job.assertions.ts";

describe("runSuite", () => {
  it("looks at the job after 1 s, then twice as long each time, until it exits, writes the tail, passes on 15 lines", async () => {
    // Arrange
    const jobs = suiteJobs();
    const files = new FakeFiles();

    // Act
    const r = await runSuite({ jobs, shell: new FakeShell(), files }, REQ);

    // Assert
    assertPassedTail(r, 15);
    deepStrictEqual(jobs.waits, [1, 1, 2]);
    assertSuiteLog(files.files.get(REQ.log) ?? "", "its whole log at /output/jobs/j1.log", "line 30\nexit=0\n");
  });

  it("gives no verdict on a suite still running at its limit", async () => {
    // Arrange
    const jobs = jobsRunningFor(99);

    // Act
    const r = await runSuite({ jobs, shell: new FakeShell(), files: new FakeFiles() }, REQ);

    // Assert
    deepStrictEqual({ status: r.status, seconds: r.status === "running" ? r.seconds : -1 }, { status: "running", seconds: 60 });
    // The wait doubles up to the slice, and the last one stops at the limit.
    deepStrictEqual(jobs.waits, [1, 1, 2, 4, 8, 16, 20, 9]);
    // A log without a verdict still ends: exit=124, never read as green.
    assertRunningUnread(r);
  });

  it("runs blocking when code cannot wait", async () => {
    // Arrange
    const shell = suiteShell(1, "1 failing");
    const jobs = jobsThatCannotWait();

    // Act
    const r = await runSuite({ jobs, shell, files: new FakeFiles() }, REQ);

    // Assert
    strictEqual(r.status, "failed");
    deepStrictEqual(shell.calls, [{ command: "npm test", options: { timeoutSeconds: 60 } }]);
  });

  it("runs blocking when the job does not start", async () => {
    // Arrange
    const jobs = jobsThatDoNotStart();

    // Act
    const r = await runSuite({ jobs, shell: new FakeShell(), files: new FakeFiles() }, REQ);

    // Assert
    strictEqual(r.status, "passed");
  });

  it("runs blocking when the first look at the job fails", async () => {
    // Arrange
    const jobs = jobsFailingFirstLook();
    const shell = suiteShell(0, "ok");
    const files = new FakeFiles();

    // Act
    const r = await runSuite({ jobs, shell, files }, REQ);

    // Assert
    strictEqual(r.status, "passed");
    ok((files.files.get(REQ.log) ?? "").includes("# run blocking (job j1 could not be read: no such job)"));
  });

  it("stops when a later look at the job fails", async () => {
    // Arrange
    const jobs = jobsFailingAfterFirstLook();

    // Act
    const lost = await runSuite({ jobs, shell: new FakeShell(), files: new FakeFiles() }, REQ);

    // Assert
    deepStrictEqual(lost, { status: "not-run", reason: "test: job j1 cannot be read: gone" });
  });
});

describe("logText", () => {
  for (const c of LOG_TEXT_CASES) {
    it(c.name, () => {
      // Arrange
      const { header, output, exit } = c;

      // Act
      const text = logText("npm test", header, output, exit);

      // Assert
      strictEqual(text, c.expected);
    });
  }
});
