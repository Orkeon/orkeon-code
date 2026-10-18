// The Shell adapter over a FakeTools shell_command. Run:
//   node --test src/shared/infrastructure/orkeon/shell.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, rejects } from "node:assert";

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
});
