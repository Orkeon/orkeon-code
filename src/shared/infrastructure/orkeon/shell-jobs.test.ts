// The ShellJobs adapter over a FakeTools shell_command. Run:
//   node --test src/shared/infrastructure/orkeon/shell-jobs.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, rejects, strictEqual } from "node:assert";

import { createShellJobs, WAIT_SCRIPT } from "./shell-jobs.ts";
import { FakeTools } from "../../../../tests/support/fake-tools.ts";

describe("createShellJobs", () => {
  it("starts a job in /workspace and reads its id and log", async () => {
    const tools = new FakeTools();
    tools.replies.shellCommand = { job_id: "3f9a", output_path: "/output/jobs/3f9a.log", status: "running" };
    deepStrictEqual(await createShellJobs(tools).start("dotnet test"), { id: "3f9a", log: "/output/jobs/3f9a.log" });
    deepStrictEqual(tools.inputsOf("shellCommand"), [
      { action: "start_job", command: "dotnet test", working_directory: "/workspace" },
    ]);
  });

  it("refuses a start that answers no id", async () => {
    const tools = new FakeTools();
    await rejects(createShellJobs(tools).start("dotnet test"), /no job id/);
  });

  it("passes a command with every job action, as the schema asks", async () => {
    const tools = new FakeTools();
    tools.replies.shellCommand = { Status: "exited", ExitCode: 1, Tail: "failed" };
    const jobs = createShellJobs(tools);
    deepStrictEqual(await jobs.status("j1"), { running: false, exitCode: 1 });
    strictEqual(await jobs.tail("j1", 9000), "failed");
    deepStrictEqual(tools.inputsOf("shellCommand"), [
      { action: "job_status", command: "", job_id: "j1", working_directory: "/workspace" },
      { action: "job_tail", command: "", job_id: "j1", tail_lines: 500, working_directory: "/workspace" },
    ]);
  });

  it("reads a running job as running, whatever exit code it carries", async () => {
    const tools = new FakeTools();
    tools.replies.shellCommand = { status: "running", exit_code: 0 };
    deepStrictEqual(await createShellJobs(tools).status("j1"), { running: true, exitCode: -1 });
  });

  it("waits through the node script, written once", async () => {
    const tools = new FakeTools();
    tools.replies.shellCommand = { exit_code: 0 };
    const jobs = createShellJobs(tools);
    strictEqual(await jobs.wait(20), true);
    strictEqual(await jobs.wait(20), true);
    strictEqual(tools.inputsOf("fileWrite").length, 1);
    strictEqual((tools.inputsOf("fileWrite")[0] as { path: string }).path, `/workspace/${WAIT_SCRIPT}`);
    deepStrictEqual(tools.inputsOf("shellCommand")[0], {
      command: `node ${WAIT_SCRIPT} 20`, working_directory: "/workspace", timeout_seconds: 50,
    });
  });

  it("says false for good once the wait cannot run", async () => {
    const tools = new FakeTools();
    tools.replies.shellCommand = new Error("interpreters are not allowed");
    const jobs = createShellJobs(tools);
    strictEqual(await jobs.wait(20), false);
    strictEqual(await jobs.wait(20), false);
    strictEqual(tools.inputsOf("shellCommand").length, 1);
  });

  it("refuses a wait that is not whole seconds", async () => {
    await rejects(createShellJobs(new FakeTools()).wait(0.5), /whole number/);
  });

  it("under a working root, starts and reads its jobs in the root, the waiter written there", async () => {
    const ROOT = "/workspace/.orkeon/worktrees/prune-F2";
    const tools = new FakeTools();
    tools.replies.shellCommand = (input: { action?: string }) =>
      input.action === "job_tail" ? { tail: `${ROOT}/src/a.ts failed` } : { job_id: "j1", output_path: "/output/jobs/j1.log", status: "running", exit_code: 0 };
    const jobs = createShellJobs(tools, ROOT);
    deepStrictEqual(await jobs.start("npm test -- /workspace/src"), { id: "j1", log: "/output/jobs/j1.log" });
    strictEqual(await jobs.tail("j1", 10), "/workspace/src/a.ts failed");
    await jobs.wait(1);
    const inputs = tools.inputsOf("shellCommand") as Array<{ command: string; working_directory: string }>;
    deepStrictEqual(inputs.map((i) => i.working_directory), [ROOT, ROOT, ROOT]);
    strictEqual(inputs[0].command, `npm test -- ${ROOT}/src`);
    deepStrictEqual(tools.inputsOf("fileWrite").map((i) => (i as { path: string }).path), [`${ROOT}/${WAIT_SCRIPT}`]);
  });
});
