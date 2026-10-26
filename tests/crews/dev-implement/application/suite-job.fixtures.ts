// The shell jobs, the request and the log lines the suite job is tested on.
import { FakeShell } from "../../../support/doubles/fake-shell.ts";
import { FakeShellJobs } from "../../../support/doubles/fake-shell-jobs.ts";
import type { SuiteRequest } from "../../../../src/crews/dev-implement/application/suite-job.ts";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";

export const REQ = { label: "test", command: "npm test", log: `${WORKSPACE}/w/logs/F1-test.txt`, limitSeconds: 60, sliceSeconds: 20 } satisfies SuiteRequest;

/** Shell jobs whose one job runs for 2 looks, then exits 0, its log 30 lines long. */
export function suiteJobs(): FakeShellJobs {
  const jobs = new FakeShellJobs();
  jobs.runningFor = 2;
  jobs.log = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join("\n");
  return jobs;
}

/** Suite jobs that run for `runningFor` looks. */
export function jobsRunningFor(runningFor: number): FakeShellJobs {
  const jobs = suiteJobs();
  jobs.runningFor = runningFor;
  return jobs;
}

/** Suite jobs whose code cannot wait. */
export function jobsThatCannotWait(): FakeShellJobs {
  const jobs = suiteJobs();
  jobs.canWait = false;
  return jobs;
}

/** Suite jobs whose job does not start. */
export function jobsThatDoNotStart(): FakeShellJobs {
  const jobs = suiteJobs();
  jobs.startError = new Error("start_job needs a running agent run");
  return jobs;
}

/** Suite jobs whose first look at the job fails. */
export function jobsFailingFirstLook(): FakeShellJobs {
  const jobs = suiteJobs();
  jobs.lookError = { after: 0, error: new Error("no such job") };
  return jobs;
}

/** Suite jobs whose job runs for 9 looks, the first look read, every later one failing. */
export function jobsFailingAfterFirstLook(): FakeShellJobs {
  const jobs = jobsRunningFor(9);
  jobs.lookError = { after: 1, error: new Error("gone") };
  return jobs;
}

/** A shell whose blocking run of `npm test` exits `exitCode` with `stdout`. */
export function suiteShell(exitCode: number, stdout: string): FakeShell {
  const shell = new FakeShell();
  shell.results["npm test"] = { exitCode, stdout };
  return shell;
}

export interface LogTextCase {
  name: string;
  header: string[];
  output: string;
  exit: number | null;
  expected: string;
}

export const LOG_TEXT_CASES: readonly LogTextCase[] = [
  { name: "writes the harness's shape: the header as comments, the output, exit= last", header: ["h"], output: "out\n", exit: 1, expected: "# $ npm test\n# h\nout\nexit=1\n" },
  { name: "writes the command line alone without header, output nor exit", header: [], output: "", exit: null, expected: "# $ npm test\n" },
];
