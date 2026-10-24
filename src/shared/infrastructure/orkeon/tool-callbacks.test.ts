// The dev crews' onToolCall and onToolResult over a FakeShell (the hooks) and a FakeLogger. Run:
//   node --test src/shared/infrastructure/orkeon/tool-callbacks.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { HOOK_TIMEOUT_SECONDS, devToolCallbacks, hookInputs, isNewFile } from "./tool-callbacks.ts";
import { FakeLogger } from "../../../../tests/support/fake-logger.ts";
import { FakeShell } from "../../../../tests/support/fake-shell.ts";

const PRE = { event: "pre-tool", command: "bash pre.sh {tool} {path}" };
const POST = { event: "post-tool", command: "bash post.sh {tool}" };

function setup(hooks: unknown[] = [], spec: Record<string, unknown> = {}) {
  const shell = new FakeShell();
  const log = new FakeLogger();
  const callbacks = devToolCallbacks({ step: "dev-plan", hooks, ...spec }, { shell, log });
  return { shell, log, callbacks, act: callbacks.forAct("plan", true) };
}

describe("onToolCall", () => {
  it("allows a call no rule covers, after its pre-tool hooks ran in order with the call's words", async () => {
    const { shell, act } = setup([PRE, { event: "stop", command: "bash stop.sh" }, { event: "pre-tool", command: "bash two.sh" }]);
    strictEqual(await act.onToolCall({ name: "file_read", input: { path: "src/a.ts" } }), "allow");
    deepStrictEqual(shell.calls, [
      { command: "bash pre.sh file_read src/a.ts", options: { timeoutSeconds: HOOK_TIMEOUT_SECONDS } },
      { command: "bash two.sh", options: { timeoutSeconds: HOOK_TIMEOUT_SECONDS } },
    ]);
  });

  it("runs a pre-tool hook once per operation of an edit_batch, with that operation's path", async () => {
    const { shell, act } = setup([PRE]);
    const input = { operations: [{ kind: "node_replace", path: "src/a.ts", text: "x" }, { kind: "node_insert", path: "docs/b.md", text: "y" }] };
    strictEqual(await act.onToolCall({ name: "edit_batch", input }), "allow");
    deepStrictEqual(shell.calls.map((c) => c.command), ["bash pre.sh edit_batch src/a.ts", "bash pre.sh edit_batch docs/b.md"]);
    deepStrictEqual(hookInputs("file_read", { path: "a" }), [{ path: "a" }]);
    deepStrictEqual(hookInputs("edit_batch", { operations: [] }), [{ operations: [] }]);
  });

  it("refuses a call a rule covers with the reason and its context line, and runs no hook", async () => {
    const { shell, log, act } = setup([PRE]);
    const verdict = await act.onToolCall({ name: "shell_command", input: { command: "git commit -m x" } });
    deepStrictEqual(verdict, {
      deny: "dev-plan: refused by 'deny shell_command command=*git commit*' of the rule set git-readonly\n" +
        "git commands that change the repository, its branches or its remotes are refused during /dev-plan: do without this call.",
    });
    deepStrictEqual(shell.commands, []);
    ok(log.lines[0].startsWith("info: dev-plan: callback refused shell_command: "), log.lines[0]);
  });

  it("refuses at the first pre-tool hook that fails, and runs none after it", async () => {
    const { shell, act } = setup([PRE, { event: "pre-tool", command: "bash two.sh" }]);
    shell.results["bash pre.sh file_read a.ts"] = { exitCode: 2, stderr: "no reads today\nmore", stdout: "ignored" };
    deepStrictEqual(await act.onToolCall({ name: "file_read", input: { path: "a.ts" } }), {
      deny: "dev-plan: refused by pre-tool hook #1 (bash pre.sh file_read a.ts) exited 2: no reads today\n" +
        "The call did not run: change it, or ask the user to fix the hook.",
    });
    deepStrictEqual(shell.commands, ["bash pre.sh file_read a.ts"]);
  });

  it("refuses when a pre-tool hook times out or cannot run", async () => {
    const { shell, act } = setup([PRE]);
    shell.results["bash pre.sh glob -"] = { timedOut: true, exitCode: -1 };
    const timedOut = await act.onToolCall({ name: "glob", input: { pattern: "*.md" } });
    ok(typeof timedOut === "object" && timedOut.deny.includes(`stopped after ${HOOK_TIMEOUT_SECONDS} s`), JSON.stringify(timedOut));
    shell.errors["bash pre.sh glob -"] = new Error("Command 'bash' is not in the allowlist\nsecond line");
    const thrown = await act.onToolCall({ name: "glob", input: { pattern: "*.md" } });
    ok(typeof thrown === "object" && thrown.deny.includes("could not run: Command 'bash' is not in the allowlist\n"),
      JSON.stringify(thrown));
  });

  it("applies the act's mode itself when the host has no gate", async () => {
    const { callbacks } = setup();
    const verdict = await callbacks.forAct("plan", false).onToolCall({ name: "file_write", input: { path: "a" } });
    ok(typeof verdict === "object" && verdict.deny.includes("the host has no permission gate"), JSON.stringify(verdict));
    strictEqual(await callbacks.forAct("acceptEdits", false).onToolCall({ name: "file_write", input: { path: "a" } }), "allow");
  });

  it("refuses with the step's name when the guard itself throws", async () => {
    const { act } = setup();
    const input = { get path(): string { throw new Error("boom"); } };
    deepStrictEqual(await act.onToolCall({ name: "file_read", input }), { deny: "dev-plan: the callback failed: boom" });
  });
});

describe("onToolResult", () => {
  it("leaves the result alone without post-tool hooks, or when they all exit 0", async () => {
    const { shell, act } = setup([PRE]);
    strictEqual(await act.onToolResult({ name: "file_read", input: {} }, "text"), undefined);
    deepStrictEqual(shell.commands, []);
    const withPost = setup([POST]);
    strictEqual(await withPost.act.onToolResult({ name: "file_read", input: {} }, { content: "x" }), undefined);
    deepStrictEqual(withPost.shell.commands, ["bash post.sh file_read"]);
  });

  it("runs every post-tool hook and appends a line for each that failed to the result's text", async () => {
    const { shell, log, act } = setup([POST, { event: "post-tool", command: "bash fmt.sh" }]);
    shell.results["bash post.sh file_write"] = { exitCode: 1, stdout: "lint: 3 errors" };
    const out = await act.onToolResult({ name: "file_write", input: { path: "a.ts" } }, { ok: true });
    deepStrictEqual(out, { context: '{"ok":true}\n[post-tool hook #1 (bash post.sh file_write) exited 1: lint: 3 errors]' });
    deepStrictEqual(shell.commands, ["bash post.sh file_write", "bash fmt.sh"]);
    deepStrictEqual(log.lines, ["warn: dev-plan: 1 post-tool hook(s) failed after file_write"]);
    shell.results["bash post.sh shell_command"] = { exitCode: 3 };
    deepStrictEqual(await act.onToolResult({ name: "shell_command", input: {} }, "plain"), {
      context: "plain\n[post-tool hook #1 (bash post.sh shell_command) exited 3]",
    });
  });
});

describe("onToolCall — the rewrite rule", () => {
  const LAYOUT = { domain: "src/domain", application: "src/app", infrastructure: "src/infra", tests: "tests" };
  // A file reader over a map: an absent path throws the runtime's message.
  const files = (present: Record<string, string>, fail?: string) => ({
    reads: [] as string[],
    async read(path: string) {
      this.reads.push(path);
      if (fail !== undefined) throw new Error(fail);
      if (!(path in present)) throw new Error(`File not found: ${path}`);
      return present[path];
    },
  });
  const implementer = (reader?: ReturnType<typeof files>) => devToolCallbacks(
    { step: "dev-implement", role: "implementer", layout: LAYOUT }, { shell: new FakeShell(), ...(reader === undefined ? {} : { files: reader }) },
  ).forAct("acceptEdits", true);

  it("refuses file_write on a source file that exists, and lets it create one that does not", async () => {
    const reader = files({ "/workspace/src/domain/big.ts": "x".repeat(40_000) });
    const act = implementer(reader);
    const refused = await act.onToolCall({ name: "file_write", input: { path: "src/domain/big.ts", content: "y" } });
    ok(typeof refused === "object" && refused.deny.includes("of the implementer's rewrite rule"), JSON.stringify(refused));
    strictEqual(await act.onToolCall({ name: "file_write", input: { path: "./src/domain/new.ts", content: "y" } }), "allow");
    strictEqual(await act.onToolCall({ name: "node_replace", input: { path: "src/domain/big.ts", selector: "A.b()", text: "y", expected_hash: "h" } }), "allow");
    deepStrictEqual(reader.reads, ["/workspace/src/domain/big.ts", "/workspace/src/domain/new.ts"]);
  });

  it("keeps the rule when the file cannot be told absent, or no reader is given", async () => {
    const act = implementer(files({}, "access denied"));
    ok(typeof await act.onToolCall({ name: "file_write", input: { path: "src/domain/a.ts", content: "y" } }) === "object");
    ok(typeof await implementer().onToolCall({ name: "file_write", input: { path: "src/domain/a.ts", content: "y" } }) === "object");
  });

  it("reads nothing for a step without a writing role", async () => {
    const reader = files({});
    const act = devToolCallbacks({ step: "dev-plan" }, { shell: new FakeShell(), files: reader }).forAct("acceptEdits", true);
    strictEqual(await act.onToolCall({ name: "file_write", input: { path: "src/domain/a.ts", content: "y" } }), "allow");
    deepStrictEqual(reader.reads, []);
  });

  it("tells a new file by the runtime's not-found message only", async () => {
    strictEqual(await isNewFile(files({}), "src/a.ts"), true);
    strictEqual(await isNewFile(files({ "/workspace/src/a.ts": "" }), "/workspace/src/a.ts"), false);
    strictEqual(await isNewFile(files({}, "timeout"), "src/a.ts"), undefined);
    strictEqual(await isNewFile(files({}), "  "), undefined);
  });
});

describe("devToolCallbacks", () => {
  it("logs why a root of the role got no rule", () => {
    const { log } = setup([], { role: "pilot", layout: { domain: "/etc", application: "src/app" } });
    deepStrictEqual(log.lines, [
      "warn: dev-plan: root '/etc' is outside /workspace: no rule",
      "warn: dev-plan: the pack gives no layout.infrastructure: no rule on it",
      "warn: dev-plan: the pack gives no layout.tests: no rule on it",
    ]);
  });
});
