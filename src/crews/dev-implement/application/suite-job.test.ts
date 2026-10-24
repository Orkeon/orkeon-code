// The build or suite as a shell job. Run:
//   node --test src/crews/dev-implement/application/suite-job.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { FakeFiles } from "../../../../tests/support/fake-files.ts";
import { FakeShell } from "../../../../tests/support/fake-shell.ts";
import type { ShellJobs } from "../../../shared/application/ports.ts";
import { runSuite } from "./suite-job.ts";

class Jobs implements ShellJobs {
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

const REQ = { label: "test", command: "npm test", log: "/workspace/w/logs/test-F1.log", limitSeconds: 60, sliceSeconds: 20 };

describe("runSuite", () => {
  it("looks at the job slice by slice until it exits, writes the tail, passes on 15 lines", async () => {
    const jobs = new Jobs();
    const files = new FakeFiles();
    const r = await runSuite({ jobs, shell: new FakeShell(), files }, REQ);
    strictEqual(r.status, "passed");
    deepStrictEqual(jobs.waits, [1, 20, 20]);
    if (r.status !== "passed") return;
    strictEqual(r.tail.split("\n").length, 15);
    ok((files.files.get(REQ.log) ?? "").includes("its whole log at /output/jobs/j1.log"));
  });

  it("gives no verdict on a suite still running at its limit", async () => {
    const jobs = new Jobs();
    jobs.runningFor = 99;
    const r = await runSuite({ jobs, shell: new FakeShell(), files: new FakeFiles() }, REQ);
    deepStrictEqual({ status: r.status, seconds: r.status === "running" ? r.seconds : -1 }, { status: "running", seconds: 60 });
  });

  it("runs blocking when code cannot wait, or when the job does not start", async () => {
    const shell = new FakeShell();
    shell.results["npm test"] = { exitCode: 1, stdout: "1 failing" };
    const jobs = new Jobs();
    jobs.canWait = false;
    const r = await runSuite({ jobs, shell, files: new FakeFiles() }, REQ);
    strictEqual(r.status, "failed");
    deepStrictEqual(shell.calls, [{ command: "npm test", options: { timeoutSeconds: 60 } }]);
    const started = new Jobs();
    started.startError = new Error("start_job needs a running agent run");
    strictEqual((await runSuite({ jobs: started, shell: new FakeShell(), files: new FakeFiles() }, REQ)).status, "passed");
  });
});
