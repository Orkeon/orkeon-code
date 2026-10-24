// The Shell adapter over a FakeTools shell_command. Run:
//   node --test src/shared/infrastructure/orkeon/shell.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, rejects, strictEqual } from "node:assert";

import { createShell } from "./shell.ts";
import { FakeTools } from "../../../../tests/support/fake-tools.ts";

describe("createShell", () => {
  it("runs the command in /workspace", async () => {
    const tools = new FakeTools();
    await createShell(tools).run("git status --short");
    deepStrictEqual(tools.inputsOf("shellCommand"), [{ command: "git status --short", working_directory: "/workspace" }]);
  });

  it("reads a snake_case result", async () => {
    const tools = new FakeTools();
    tools.replies.shellCommand = { stdout: "M a.ts\n", stderr: "", exit_code: 0 };
    deepStrictEqual(await createShell(tools).run("git status"), { stdout: "M a.ts\n", stderr: "", exitCode: 0 });
  });

  it("reads a PascalCase result", async () => {
    const tools = new FakeTools();
    tools.replies.shellCommand = { Stdout: "", Stderr: "fatal: not a git repository", ExitCode: 128 };
    deepStrictEqual(await createShell(tools).run("git status"), {
      stdout: "", stderr: "fatal: not a git repository", exitCode: 128,
    });
  });

  it("reports -1 when the result carries no exit code", async () => {
    const tools = new FakeTools();
    tools.replies.shellCommand = { stdout: "x" };
    deepStrictEqual(await createShell(tools).run("true"), { stdout: "x", stderr: "", exitCode: -1 });
  });

  it("lets a refused call throw", async () => {
    const tools = new FakeTools();
    tools.replies.shellCommand = new Error("tools.shellCommand failed: denied by mode 'plan'");
    await rejects(createShell(tools).run("rm -rf build"), /denied by mode 'plan'/);
  });

  it("passes no timeout without options", async () => {
    const tools = new FakeTools();
    await createShell(tools).run("git status", {});
    deepStrictEqual(tools.inputsOf("shellCommand"), [{ command: "git status", working_directory: "/workspace" }]);
  });

  it("passes the timeout as timeout_seconds", async () => {
    const tools = new FakeTools();
    await createShell(tools).run("npm test", { timeoutSeconds: 30 });
    deepStrictEqual(tools.inputsOf("shellCommand"), [
      { command: "npm test", working_directory: "/workspace", timeout_seconds: 30 },
    ]);
  });

  for (const bad of [0, 1.5, -1]) {
    it(`refuses a timeout of ${bad} before any call`, async () => {
      const tools = new FakeTools();
      await rejects(createShell(tools).run("npm test", { timeoutSeconds: bad }), {
        message: `a shell timeout is a whole number of seconds, at least 1: ${bad}`,
      });
      deepStrictEqual(tools.calls, []);
    });
  }

  it("reads completed: false as a timeout", async () => {
    const tools = new FakeTools();
    tools.replies.shellCommand = { stdout: "partial", stderr: "", exit_code: -1, completed: false };
    deepStrictEqual(await createShell(tools).run("sleep 5", { timeoutSeconds: 1 }), {
      stdout: "partial", stderr: "", exitCode: -1, timedOut: true,
    });
  });

  it("reads a PascalCase Completed: false as a timeout", async () => {
    const tools = new FakeTools();
    tools.replies.shellCommand = { Stdout: "", Stderr: "", ExitCode: -1, Completed: false };
    strictEqual((await createShell(tools).run("sleep 5")).timedOut, true);
  });

  it("adds no timedOut key when completed is true or absent", async () => {
    for (const reply of [{ stdout: "", exit_code: 0, completed: true }, { stdout: "", exit_code: 0 }]) {
      const tools = new FakeTools();
      tools.replies.shellCommand = reply;
      ok(!("timedOut" in (await createShell(tools).run("true"))));
    }
  });
});

describe("createShell — under a working root", () => {
  const ROOT = "/workspace/.orkeon/worktrees/prune-F2";

  it("runs in the root, its command's /workspace paths on the root, its output's root paths back on /workspace", async () => {
    const tools = new FakeTools();
    tools.replies.shellCommand = { stdout: `${ROOT}\n`, stderr: `${ROOT}/src/a.ts:1 error`, exit_code: 0 };
    const r = await createShell(tools, ROOT).run("git -C /workspace rev-parse --show-toplevel", { timeoutSeconds: 5 });
    deepStrictEqual(tools.inputsOf("shellCommand"), [
      { command: `git -C ${ROOT} rev-parse --show-toplevel`, working_directory: ROOT, timeout_seconds: 5 },
    ]);
    deepStrictEqual(r, { stdout: "/workspace\n", stderr: "/workspace/src/a.ts:1 error", exitCode: 0 });
  });

  it("calls shell_command exactly as before without a root", async () => {
    const tools = new FakeTools();
    await createShell(tools, undefined).run("cat /workspace/a");
    deepStrictEqual(tools.inputsOf("shellCommand"), [{ command: "cat /workspace/a", working_directory: "/workspace" }]);
  });
});
