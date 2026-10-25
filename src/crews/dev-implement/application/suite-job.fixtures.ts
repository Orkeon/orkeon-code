// The shell jobs, the request and the log lines the suite job is tested on.
import { FakeShell } from "../../../../tests/support/fake-shell.ts";
import type { ShellJobs } from "../../../shared/application/ports.ts";
import type { SuiteRequest } from "./suite-job.ts";

/** Shell jobs whose one job runs for `runningFor` looks, then exits 0; each wait asked for is recorded. */
export class Jobs implements ShellJobs {
  looks = 0;
  waits: number[] = [];
  runningFor = 2;
  canWait = true;
  startError: Error | null = null;
  async start() { if (this.startError) throw this.startError; return { id: "j1", log: "/output/jobs/j1.log" }; }
  async status() { this.looks++; return this.looks > this.runningFor ? { running: false, exitCode: 0 } : { running: true, exitCode: -1 }; }
  async tail() { return Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join("\n"); }
  async wait(s: number) { this.waits.push(s); return this.canWait; }
}

export const REQ = { label: "test", command: "npm test", log: "/workspace/w/logs/F1-test.txt", limitSeconds: 60, sliceSeconds: 20 } satisfies SuiteRequest;

/** Jobs that run for `runningFor` looks. */
export function jobsRunningFor(runningFor: number): Jobs {
  const jobs = new Jobs();
  jobs.runningFor = runningFor;
  return jobs;
}

/** Jobs whose code cannot wait. */
export function jobsThatCannotWait(): Jobs {
  const jobs = new Jobs();
  jobs.canWait = false;
  return jobs;
}

/** Jobs whose job does not start. */
export function jobsThatDoNotStart(): Jobs {
  const jobs = new Jobs();
  jobs.startError = new Error("start_job needs a running agent run");
  return jobs;
}

/** Jobs whose first look at the job fails. */
export function jobsFailingFirstLook(): Jobs {
  const jobs = new Jobs();
  jobs.status = async () => { throw new Error("no such job"); };
  return jobs;
}

/** Jobs whose job runs for 9 looks, the first look read, every later one failing. */
export function jobsFailingAfterFirstLook(): Jobs {
  const jobs = jobsRunningFor(9);
  const status = jobs.status.bind(jobs);
  jobs.status = async () => { if (jobs.looks >= 1) throw new Error("gone"); return status(); };
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
