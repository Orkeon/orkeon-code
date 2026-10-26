// The plumbing of the dev crews' onToolCall and onToolResult over a FakeShell (the hooks), a file reader and a
// FakeLogger; the decision itself is tool-call-policy.test.ts's. Run:
//   node --test src/shared/application/dev/tool-callbacks.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { HOOK_TIMEOUT_SECONDS, devToolCallbacks, hookInputs, isNewFile, rootedCallbacks } from "../../../../src/shared/application/dev/tool-callbacks.ts";
import { FakeShell } from "../../../support/doubles/fake-shell.ts";
import {
  FAILED_HOOK_DENY, LAYOUT, MOUNT_DENIAL, MOUNT_DENY, NEW_FILES, PILOT_WARNINGS, POST, PRE, PRE_HOOK_CALLS, ROOT,
  SHELL_WRITE_INTO_MEMORY, WHOLE_HOOK_INPUTS, implementer, mainLoopGuard, readerOfAll, setup,
} from "./tool-callbacks.fixtures.ts";
import { assertDenied, assertDeniedWith } from "./tool-callbacks.assertions.ts";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";

describe("onToolCall", () => {
  it("allows a call no rule covers, after its pre-tool hooks ran in order with the call's words", async () => {
    // Arrange
    const { shell, act } = setup([PRE, { event: "stop", command: "bash stop.sh" }, { event: "pre-tool", command: "bash two.sh" }]);

    // Act
    const verdict = await act.onToolCall({ name: "file_read", input: { path: `${WORKSPACE}/src/a.ts` } });

    // Assert
    strictEqual(verdict, "allow");
    deepStrictEqual(shell.calls, PRE_HOOK_CALLS);
  });

  it("runs a pre-tool hook once per operation of an edit_batch, with that operation's path", async () => {
    // Arrange
    const { shell, act } = setup([PRE]);
    const input = { operations: [{ kind: "node_replace", path: `${WORKSPACE}/src/a.ts`, text: "x" }, { kind: "node_insert", path: `${WORKSPACE}/docs/b.md`, text: "y" }] };

    // Act
    const verdict = await act.onToolCall({ name: "edit_batch", input });

    // Assert
    strictEqual(verdict, "allow");
    deepStrictEqual(shell.calls.map((c) => c.command), [`bash pre.sh edit_batch ${WORKSPACE}/src/a.ts`, `bash pre.sh edit_batch ${WORKSPACE}/docs/b.md`]);
  });

  for (const c of WHOLE_HOOK_INPUTS) {
    it(c.name, () => {
      // Arrange
      const { tool, input } = c;

      // Act
      const inputs = hookInputs(tool, input);

      // Assert
      deepStrictEqual(inputs, c.expected);
    });
  }

  it("refuses when a pre-tool hook times out", async () => {
    // Arrange
    const { shell, act } = setup([PRE]);
    shell.results["bash pre.sh glob -"] = { timedOut: true, exitCode: -1 };

    // Act
    const timedOut = await act.onToolCall({ name: "glob", input: { pattern: "*.md" } });

    // Assert
    assertDenied(timedOut, [`stopped after ${HOOK_TIMEOUT_SECONDS} s`]);
  });

  it("refuses when a pre-tool hook cannot run", async () => {
    // Arrange
    const { shell, act } = setup([PRE]);
    shell.errors["bash pre.sh glob -"] = new Error("Command 'bash' is not in the allowlist\nsecond line");

    // Act
    const thrown = await act.onToolCall({ name: "glob", input: { pattern: "*.md" } });

    // Assert
    assertDenied(thrown, ["could not run: Command 'bash' is not in the allowlist\n"]);
  });

  it("refuses with the first line of a failing pre-tool hook's error output, and logs it", async () => {
    // Arrange
    const { shell, log, act } = setup([PRE]);
    shell.results[`bash pre.sh file_read ${WORKSPACE}/a.ts`] = { exitCode: 2, stderr: "no reads today\nmore", stdout: "ignored" };

    // Act
    const verdict = await act.onToolCall({ name: "file_read", input: { path: `${WORKSPACE}/a.ts` } });

    // Assert
    deepStrictEqual(verdict, { deny: FAILED_HOOK_DENY });
    deepStrictEqual(log.lines, ["info: dev-plan: pre-tool hook #1 refused file_read"]);
  });

  it("names the runtime's mount check, not the hook, when the shell refuses the hook's command line", async () => {
    // Arrange
    const { shell, log, act } = setup([PRE]);
    shell.errors["bash pre.sh directory_read /cli-commands"] = new Error(`${MOUNT_DENIAL}\nsecond line`);

    // Act
    const verdict = await act.onToolCall({ name: "directory_read", input: { path: "/cli-commands" } });

    // Assert
    deepStrictEqual(verdict, { deny: MOUNT_DENY });
    deepStrictEqual(log.lines, ["info: dev-plan: the runtime's mount check refused pre-tool hook #1 for directory_read"]);
  });

  it("names the runtime's mount check when its refusal comes back as a result not completed, not a timeout", async () => {
    // Arrange
    const { shell, act } = setup([PRE]);
    shell.results["bash pre.sh directory_read /crews"] = { exitCode: -1, timedOut: true, stderr: "Argument denied: Access denied to '/crews'" };

    // Act
    const second = await act.onToolCall({ name: "directory_read", input: { path: "/crews" } });

    // Assert
    assertDenied(second, ["the runtime's mount check refused"], ["stopped after"]);
  });

});

describe("onToolResult", () => {
  it("leaves the result alone without post-tool hooks", async () => {
    // Arrange
    const { shell, act } = setup([PRE]);

    // Act
    const out = await act.onToolResult({ name: "file_read", input: {} }, "text");

    // Assert
    strictEqual(out, undefined);
    deepStrictEqual(shell.commands, []);
  });

  it("leaves the result alone when the post-tool hooks all exit 0", async () => {
    // Arrange
    const { shell, act } = setup([POST]);

    // Act
    const out = await act.onToolResult({ name: "file_read", input: {} }, { content: "x" });

    // Assert
    strictEqual(out, undefined);
    deepStrictEqual(shell.commands, ["bash post.sh file_read"]);
  });

  it("runs every post-tool hook and appends a line for each that failed to the result's text", async () => {
    // Arrange
    const { shell, log, act } = setup([POST, { event: "post-tool", command: "bash fmt.sh" }]);
    shell.results["bash post.sh file_write"] = { exitCode: 1, stdout: "lint: 3 errors" };

    // Act
    const out = await act.onToolResult({ name: "file_write", input: { path: "a.ts" } }, { ok: true });

    // Assert
    deepStrictEqual(out, { context: '{"ok":true}\n[post-tool hook #1 (bash post.sh file_write) exited 1: lint: 3 errors]' });
    deepStrictEqual(shell.commands, ["bash post.sh file_write", "bash fmt.sh"]);
    deepStrictEqual(log.lines, ["warn: dev-plan: 1 post-tool hook(s) failed after file_write"]);
  });

  it("appends the failed hook's line to a plain text result, without output when it printed none", async () => {
    // Arrange
    const { shell, act } = setup([POST, { event: "post-tool", command: "bash fmt.sh" }]);
    shell.results["bash post.sh shell_command"] = { exitCode: 3 };

    // Act
    const out = await act.onToolResult({ name: "shell_command", input: {} }, "plain");

    // Assert
    deepStrictEqual(out, { context: "plain\n[post-tool hook #1 (bash post.sh shell_command) exited 3]" });
  });
});

describe("onToolCall — the rewrite rule", () => {
  it("keeps the rule when no reader is given", async () => {
    // Arrange
    const act = implementer();

    // Act
    const verdict = await act.onToolCall({ name: "file_write", input: { path: `${WORKSPACE}/src/domain/a.ts`, content: "y" } });

    // Assert
    strictEqual(typeof verdict, "object");
  });

  for (const c of NEW_FILES) {
    it(`${c.name}: by the runtime's not-found message only`, async () => {
      // Arrange
      const reader = c.reader();

      // Act
      const isNew = await isNewFile(reader, c.path);

      // Assert
      strictEqual(isNew, c.expected);
    });
  }
});

describe("rootedCallbacks — a batch under its working root", () => {
  it(`judges <root>/src/x.ts as ${WORKSPACE}/src/x.ts`, async () => {
    // Arrange
    const { reads, reader } = readerOfAll();
    const shell = new FakeShell();
    const inner = devToolCallbacks({ step: "dev-implement", role: "implementer", layout: LAYOUT, hooks: [PRE] }, { shell, files: reader });
    const act = rootedCallbacks(inner, ROOT).forAct("acceptEdits", true);

    // Act
    const refused = await act.onToolCall({ name: "file_write", input: { path: `${ROOT}/src/domain/big.ts`, content: "y" } });

    // Assert
    assertDenied(refused, ["of the implementer's rewrite rule"]);
    deepStrictEqual(reads, [`${WORKSPACE}/src/domain/big.ts`]);
    deepStrictEqual(shell.commands, []);
  });

  it("resolves a relative path under the root, judged as its logical path, and runs the call with it", async () => {
    // Arrange
    const { reader } = readerOfAll();
    const shell = new FakeShell();
    const inner = devToolCallbacks({ step: "dev-implement", role: "implementer", layout: LAYOUT, hooks: [PRE] }, { shell, files: reader });
    const act = rootedCallbacks(inner, ROOT).forAct("acceptEdits", true);

    // Act
    const verdict = await act.onToolCall({ name: "file_read", input: { path: "src/a.ts" } });

    // Assert
    deepStrictEqual(verdict, { input: { path: `${ROOT}/src/a.ts` } });
    deepStrictEqual(shell.calls.map((c) => c.command), [`bash pre.sh file_read ${WORKSPACE}/src/a.ts`]);
  });

  it("hands the hooks the logical path of a call under the root", async () => {
    // Arrange
    const { reader } = readerOfAll();
    const shell = new FakeShell();
    const inner = devToolCallbacks({ step: "dev-implement", role: "implementer", layout: LAYOUT, hooks: [PRE] }, { shell, files: reader });
    const act = rootedCallbacks(inner, ROOT).forAct("acceptEdits", true);

    // Act
    const verdict = await act.onToolCall({ name: "file_read", input: { path: `${ROOT}/src/a.ts` } });

    // Assert
    strictEqual(verdict, "allow");
    deepStrictEqual(shell.commands, [`bash pre.sh file_read ${WORKSPACE}/src/a.ts`]);
  });

  it("is the callbacks themselves without a root", () => {
    // Arrange
    const inner = devToolCallbacks({ step: "dev-plan" }, { shell: new FakeShell() });

    // Act
    const rooted = rootedCallbacks(inner, undefined);

    // Assert
    strictEqual(rooted, inner);
  });
});

describe("devToolCallbacks", () => {
  it("logs why a root of the role got no rule", () => {
    // Arrange
    const spec = { role: "pilot", layout: { domain: "/etc", application: `${WORKSPACE}/src/app` } };

    // Act
    const { log } = setup([], spec);

    // Assert
    deepStrictEqual(log.lines, PILOT_WARNINGS);
  });
});

describe("the shared memory's guard in the callbacks", () => {
  it("guards the main loop's acts: a shell write into the memory is denied", async () => {
    // Arrange
    const { act } = mainLoopGuard();

    // Act
    const verdict = await act.onToolCall(SHELL_WRITE_INTO_MEMORY);

    // Assert
    assertDeniedWith(verdict, "refused by the shared memory's guard:");
  });

  it("guards the main loop's acts alone, reading the folder once", async () => {
    // Arrange
    const { act, counter } = mainLoopGuard();
    await act.onToolCall(SHELL_WRITE_INTO_MEMORY);

    // Act
    const verdict = await act.onToolCall({ name: "file_write", input: { path: `${WORKSPACE}/src/a.ts`, content: "x" } });

    // Assert
    strictEqual(verdict, "allow");
    strictEqual(counter.reads, 1);
  });

  it("leaves the main loop's results alone", async () => {
    // Arrange
    const { act } = mainLoopGuard();

    // Act
    const out = await act.onToolResult({ name: "file_write", input: {} }, "ok");

    // Assert
    strictEqual(out, undefined);
  });
});
