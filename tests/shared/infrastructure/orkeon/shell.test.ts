// The Shell adapter over a FakeTools shell_command. Run:
//   node --test tests/shared/infrastructure/orkeon/shell.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, rejects, strictEqual } from "node:assert";

import { createShell } from "../../../../src/shared/infrastructure/orkeon/shell.ts";
import { FakeTools } from "../../../support/doubles/fake-tools.ts";
import { BAD_TIMEOUTS, COMPLETED_REPLIES, ROOT } from "./shell.fixtures.ts";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";

describe("createShell", () => {
  it(`runs the command in ${WORKSPACE}`, async () => {
    // Arrange
    const tools = new FakeTools();

    // Act
    await createShell(tools).run("git status --short");

    // Assert
    deepStrictEqual(tools.inputsOf("shellCommand"), [{ command: "git status --short", working_directory: WORKSPACE }]);
  });

  it("reads a snake_case result", async () => {
    // Arrange
    const tools = new FakeTools();
    tools.replies.shellCommand = { stdout: "M a.ts\n", stderr: "", exit_code: 0 };

    // Act
    const result = await createShell(tools).run("git status");

    // Assert
    deepStrictEqual(result, { stdout: "M a.ts\n", stderr: "", exitCode: 0 });
  });

  it("reads a PascalCase result", async () => {
    // Arrange
    const tools = new FakeTools();
    tools.replies.shellCommand = { Stdout: "", Stderr: "fatal: not a git repository", ExitCode: 128 };

    // Act
    const result = await createShell(tools).run("git status");

    // Assert
    deepStrictEqual(result, { stdout: "", stderr: "fatal: not a git repository", exitCode: 128 });
  });

  it("reports -1 when the result carries no exit code", async () => {
    // Arrange
    const tools = new FakeTools();
    tools.replies.shellCommand = { stdout: "x" };

    // Act
    const result = await createShell(tools).run("true");

    // Assert
    deepStrictEqual(result, { stdout: "x", stderr: "", exitCode: -1 });
  });

  it("lets a refused call throw", async () => {
    // Arrange
    const tools = new FakeTools();
    tools.replies.shellCommand = new Error("tools.shellCommand failed: denied by mode 'plan'");

    // Act
    const act = createShell(tools).run("rm -rf build");

    // Assert
    await rejects(act, /denied by mode 'plan'/);
  });

  it("passes no timeout without options", async () => {
    // Arrange
    const tools = new FakeTools();

    // Act
    await createShell(tools).run("git status", {});

    // Assert
    deepStrictEqual(tools.inputsOf("shellCommand"), [{ command: "git status", working_directory: WORKSPACE }]);
  });

  it("passes the timeout as timeout_seconds", async () => {
    // Arrange
    const tools = new FakeTools();

    // Act
    await createShell(tools).run("npm test", { timeoutSeconds: 30 });

    // Assert
    deepStrictEqual(tools.inputsOf("shellCommand"), [
      { command: "npm test", working_directory: WORKSPACE, timeout_seconds: 30 },
    ]);
  });

  for (const bad of BAD_TIMEOUTS) {
    it(`refuses a timeout of ${bad} before any call`, async () => {
      // Arrange
      const tools = new FakeTools();

      // Act
      const act = createShell(tools).run("npm test", { timeoutSeconds: bad });

      // Assert
      await rejects(act, { message: `a shell timeout is a whole number of seconds, at least 1: ${bad}` });
      deepStrictEqual(tools.calls, []);
    });
  }

  it("reads completed: false as a timeout", async () => {
    // Arrange
    const tools = new FakeTools();
    tools.replies.shellCommand = { stdout: "partial", stderr: "", exit_code: -1, completed: false };

    // Act
    const result = await createShell(tools).run("sleep 5", { timeoutSeconds: 1 });

    // Assert
    deepStrictEqual(result, { stdout: "partial", stderr: "", exitCode: -1, timedOut: true });
  });

  it("reads a PascalCase Completed: false as a timeout", async () => {
    // Arrange
    const tools = new FakeTools();
    tools.replies.shellCommand = { Stdout: "", Stderr: "", ExitCode: -1, Completed: false };

    // Act
    const result = await createShell(tools).run("sleep 5");

    // Assert
    strictEqual(result.timedOut, true);
  });

  for (const c of COMPLETED_REPLIES) {
    it(c.name, async () => {
      // Arrange
      const tools = new FakeTools();
      tools.replies.shellCommand = c.reply;

      // Act
      const result = await createShell(tools).run("true");

      // Assert
      ok(!("timedOut" in result), `a timedOut key on ${JSON.stringify(result)}`);
    });
  }
});

describe("createShell — under a working root", () => {
  it(`runs in the root, its command's ${WORKSPACE} paths on the root, its output's root paths back on ${WORKSPACE}`, async () => {
    // Arrange
    const tools = new FakeTools();
    tools.replies.shellCommand = { stdout: `${ROOT}\n`, stderr: `${ROOT}/src/a.ts:1 error`, exit_code: 0 };

    // Act
    const r = await createShell(tools, ROOT).run(`git -C ${WORKSPACE} rev-parse --show-toplevel`, { timeoutSeconds: 5 });

    // Assert
    deepStrictEqual(tools.inputsOf("shellCommand"), [
      { command: `git -C ${ROOT} rev-parse --show-toplevel`, working_directory: ROOT, timeout_seconds: 5 },
    ]);
    deepStrictEqual(r, { stdout: `${WORKSPACE}\n`, stderr: `${WORKSPACE}/src/a.ts:1 error`, exitCode: 0 });
  });

  it("calls shell_command exactly as before without a root", async () => {
    // Arrange
    const tools = new FakeTools();

    // Act
    await createShell(tools, undefined).run(`cat ${WORKSPACE}/a`);

    // Assert
    deepStrictEqual(tools.inputsOf("shellCommand"), [{ command: `cat ${WORKSPACE}/a`, working_directory: WORKSPACE }]);
  });
});
