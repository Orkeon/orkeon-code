// The ShellJobs adapter over a FakeTools shell_command. Run:
//   node --test src/shared/infrastructure/orkeon/shell-jobs.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, rejects, strictEqual } from "node:assert";

import { createShellJobs, WAIT_SCRIPT } from "./shell-jobs.ts";
import { FakeTools } from "../../../../tests/support/fake-tools.ts";
import { ROOT, rootedTools, workingDirectories } from "./shell-jobs.fixtures.ts";
import { WORKSPACE } from "../../domain/vfs.ts";

describe("createShellJobs", () => {
  it(`starts a job in ${WORKSPACE} and reads its id and log`, async () => {
    // Arrange
    const tools = new FakeTools();
    tools.replies.shellCommand = { job_id: "3f9a", output_path: "/output/jobs/3f9a.log", status: "running" };

    // Act
    const job = await createShellJobs(tools).start("dotnet test");

    // Assert
    deepStrictEqual(job, { id: "3f9a", log: "/output/jobs/3f9a.log" });
    deepStrictEqual(tools.inputsOf("shellCommand"), [
      { action: "start_job", command: "dotnet test", working_directory: WORKSPACE },
    ]);
  });

  it("refuses a start that answers no id", async () => {
    // Arrange
    const tools = new FakeTools();

    // Act
    const act = createShellJobs(tools).start("dotnet test");

    // Assert
    await rejects(act, /no job id/);
  });

  it("passes a command with the job_status action, as the schema asks", async () => {
    // Arrange
    const tools = new FakeTools();
    tools.replies.shellCommand = { Status: "exited", ExitCode: 1, Tail: "failed" };

    // Act
    const status = await createShellJobs(tools).status("j1");

    // Assert
    deepStrictEqual(status, { running: false, exitCode: 1 });
    deepStrictEqual(tools.inputsOf("shellCommand"), [
      { action: "job_status", command: "", job_id: "j1", working_directory: WORKSPACE },
    ]);
  });

  it("passes a command with the job_tail action, as the schema asks", async () => {
    // Arrange
    const tools = new FakeTools();
    tools.replies.shellCommand = { Status: "exited", ExitCode: 1, Tail: "failed" };

    // Act
    const tail = await createShellJobs(tools).tail("j1", 9000);

    // Assert
    strictEqual(tail, "failed");
    deepStrictEqual(tools.inputsOf("shellCommand"), [
      { action: "job_tail", command: "", job_id: "j1", tail_lines: 500, working_directory: WORKSPACE },
    ]);
  });

  it("reads a running job as running, whatever exit code it carries", async () => {
    // Arrange
    const tools = new FakeTools();
    tools.replies.shellCommand = { status: "running", exit_code: 0 };

    // Act
    const status = await createShellJobs(tools).status("j1");

    // Assert
    deepStrictEqual(status, { running: true, exitCode: -1 });
  });

  it(`waits through the node script, written in ${WORKSPACE}`, async () => {
    // Arrange
    const tools = new FakeTools();
    tools.replies.shellCommand = { exit_code: 0 };

    // Act
    const done = await createShellJobs(tools).wait(20);

    // Assert
    strictEqual(done, true);
    strictEqual((tools.inputsOf("fileWrite")[0] as { path: string }).path, `${WORKSPACE}/${WAIT_SCRIPT}`);
    deepStrictEqual(tools.inputsOf("shellCommand")[0], {
      command: `node ${WAIT_SCRIPT} 20`, working_directory: WORKSPACE, timeout_seconds: 50,
    });
  });

  it("writes the wait script once over two waits", async () => {
    // Arrange
    const tools = new FakeTools();
    tools.replies.shellCommand = { exit_code: 0 };
    const jobs = createShellJobs(tools);
    await jobs.wait(20);

    // Act
    const done = await jobs.wait(20);

    // Assert
    strictEqual(done, true);
    strictEqual(tools.inputsOf("fileWrite").length, 1);
  });

  it("says false when the wait cannot run", async () => {
    // Arrange
    const tools = new FakeTools();
    tools.replies.shellCommand = new Error("interpreters are not allowed");

    // Act
    const done = await createShellJobs(tools).wait(20);

    // Assert
    strictEqual(done, false);
  });

  it("says false for good once the wait cannot run, without trying again", async () => {
    // Arrange
    const tools = new FakeTools();
    tools.replies.shellCommand = new Error("interpreters are not allowed");
    const jobs = createShellJobs(tools);
    await jobs.wait(20);

    // Act
    const done = await jobs.wait(20);

    // Assert
    strictEqual(done, false);
    strictEqual(tools.inputsOf("shellCommand").length, 1);
  });

  it("refuses a wait that is not whole seconds", async () => {
    // Arrange
    const jobs = createShellJobs(new FakeTools());

    // Act
    const act = jobs.wait(0.5);

    // Assert
    await rejects(act, /whole number/);
  });

  it("under a working root, starts its jobs in the root, the paths of the command moved there", async () => {
    // Arrange
    const tools = rootedTools();

    // Act
    const job = await createShellJobs(tools, ROOT).start(`npm test -- ${WORKSPACE}/src`);

    // Assert
    deepStrictEqual(job, { id: "j1", log: "/output/jobs/j1.log" });
    deepStrictEqual(workingDirectories(tools), [ROOT]);
    strictEqual((tools.inputsOf("shellCommand")[0] as { command: string }).command, `npm test -- ${ROOT}/src`);
  });

  it(`under a working root, reads a job's tail in the root, its paths moved back to ${WORKSPACE}`, async () => {
    // Arrange
    const tools = rootedTools();

    // Act
    const tail = await createShellJobs(tools, ROOT).tail("j1", 10);

    // Assert
    strictEqual(tail, `${WORKSPACE}/src/a.ts failed`);
    deepStrictEqual(workingDirectories(tools), [ROOT]);
  });

  it("under a working root, waits in the root, the waiter written there", async () => {
    // Arrange
    const tools = rootedTools();

    // Act
    await createShellJobs(tools, ROOT).wait(1);

    // Assert
    deepStrictEqual(workingDirectories(tools), [ROOT]);
    deepStrictEqual(tools.inputsOf("fileWrite").map((i) => (i as { path: string }).path), [`${ROOT}/${WAIT_SCRIPT}`]);
  });
});
