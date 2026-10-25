// The dev crews' ports built from the calling agent's own tools, never the runtime's globals: the globals throw
// here, set before the module is loaded, and every call lands in the body's FakeTools. Under a working root the
// briefs leave as root paths, and the spend guard denies a batch's calls past its bound. Run:
//   node --test src/shared/infrastructure/orkeon/dev-deps.test.ts
import { before, describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { FakeTools } from "../../../../tests/support/fake-tools.ts";
import { FakeLogger } from "../../../../tests/support/fake-logger.ts";

const throwing = (name: string) => new Proxy(() => undefined, {
  get: (_t, key) => { throw new Error(`the global ${name}.${String(key)} was reached`); },
  apply: () => { throw new Error(`the global ${name}() was reached`); },
});

type Module = typeof import("./dev-deps.ts");
let m: Module;

before(async () => {
  const g = globalThis as Record<string, unknown>;
  for (const name of ["tools", "agentBuilder", "crewBuilder", "toolBuilder"]) g[name] = throwing(name);
  m = await import("./dev-deps.ts");
});

const ROOT = "/workspace/.orkeon/worktrees/prune-F2";

/** A body's context: its own tools, and an llm that keeps what it was asked. */
function context() {
  const tools = new FakeTools();
  tools.replies.fileRead = { content: "x", success: true };
  tools.replies.shellCommand = { stdout: "", stderr: "", exit_code: 0, success: true };
  const asked: Array<{ call: string; prompt: unknown; options: any }> = [];
  const llm = {
    act: async (prompt: string, options: any) => { asked.push({ call: "act", prompt, options }); return { output: "done" }; },
    complete: async (prompt: string) => { asked.push({ call: "complete", prompt, options: undefined }); return "done"; },
    chat: async (messages: unknown, options: any) => { asked.push({ call: "chat", prompt: messages, options }); return { content: "done" }; },
    extract: async (prompt: string) => { asked.push({ call: "extract", prompt, options: undefined }); return { ok: true }; },
  };
  return { ctx: { tools: tools as unknown as OrkeonTools, llm: llm as any, log: new FakeLogger() }, tools, asked };
}

const LAYOUT = { domain: "src/domain", application: "src/application", tests: "tests", shared: [], buildOutputs: [] };

describe("implementDeps and verifyDeps", () => {
  it("reach only the body's tools: files, shell, config and jobs", async () => {
    const { ctx, tools } = context();
    const deps = m.implementDeps(ctx, { hooks: [], effort: undefined, memoryOn: true, toolSlot: undefined });
    await deps.files.read("/workspace/a.ts");
    await deps.shell.run("git status");
    await deps.config.readValue("memory.dir").catch(() => undefined);
    ok(tools.calls.some((c) => c.tool === "fileRead"));
    ok(tools.calls.some((c) => c.tool === "shellCommand"));
    const verify = m.verifyDeps(ctx, { hooks: [], effort: undefined, memoryOn: true, validationSlot: undefined });
    await verify.files.read("/workspace/b.ts");
    strictEqual(tools.inputsOf("fileRead").length >= 2, true);
  });

  it("without a root, name /workspace as today, with the cost index; under a root, the root's paths and no cost index", async () => {
    const plain = context();
    const deps = m.implementDeps(plain.ctx, { hooks: [], effort: undefined, memoryOn: false, toolSlot: undefined });
    ok(deps.costIndex !== undefined);
    await deps.files.read("/workspace/src/a.ts");
    strictEqual((plain.tools.inputsOf("fileRead")[0] as { path: string }).path, "/workspace/src/a.ts");
    const rooted = context();
    const batch = m.implementDeps(rooted.ctx, { hooks: [], effort: undefined, memoryOn: false, toolSlot: undefined, root: ROOT });
    strictEqual(batch.costIndex, undefined);
    await batch.files.read("/workspace/src/a.ts");
    strictEqual((rooted.tools.inputsOf("fileRead")[0] as { path: string }).path, `${ROOT}/src/a.ts`);
  });

  it("send a batch's briefs with its root's paths: a role's act, the audit's act and system text, and an extract", async () => {
    const { ctx, asked } = context();
    const deps = m.implementDeps(ctx, { hooks: [], effort: undefined, memoryOn: false, toolSlot: undefined, root: ROOT });
    await deps.roleLlm("implementer", LAYOUT, () => undefined, []).act(
      "Turn green the tests of /workspace/tests/a.test.ts; the sheet is /workspace/todo/prune/PRUNE-PLAN-F2.md", { system: "Work in /workspace." },
    );
    const verify = m.verifyDeps(ctx, { hooks: [], effort: undefined, memoryOn: false, validationSlot: undefined, root: ROOT });
    await verify.llm.act("Audit /workspace/todo/prune/capture-F2/ and run_validation", { system: "The checkout is /workspace" });
    await verify.llm.extract("Rows of /workspace/todo/prune/PRUNE-VERIFY-F2.md", {});
    const text = JSON.stringify(asked.map((a) => [a.prompt, a.options?.system]));
    ok(!/\/workspace\/(?!\.orkeon\/worktrees\/prune-F2)/.test(text) && !/\/workspace["\s.]/.test(text), text);
    ok(text.includes(`${ROOT}/todo/prune/PRUNE-PLAN-F2.md`) && text.includes(`${ROOT}/todo/prune/capture-F2/`), text);
  });

  it("keep what a batch's brief quotes of the files: a quoted /workspace constant, a fenced diff", async () => {
    const { ctx, asked } = context();
    const deps = m.implementDeps(ctx, { hooks: [], effort: undefined, memoryOn: false, toolSlot: undefined, root: ROOT });
    const brief = 'Step 1 of /workspace/todo/prune/PRUNE-PLAN-F2.md: keep `const WORKING_DIRECTORY = "/workspace";`\n```diff\n+ cd /workspace\n```';
    await deps.roleLlm("implementer", LAYOUT, () => undefined, []).act(brief, {});
    strictEqual(asked[0].prompt,
      `Step 1 of ${ROOT}/todo/prune/PRUNE-PLAN-F2.md: keep \`const WORKING_DIRECTORY = "/workspace";\`\n\`\`\`diff\n+ cd /workspace\n\`\`\``);
  });

  it("hand the act's callbacks the logical path of a call under the root", async () => {
    const { ctx, asked } = context();
    const wrote: string[] = [];
    const deps = m.implementDeps(ctx, { hooks: [], effort: undefined, memoryOn: false, toolSlot: undefined, root: ROOT });
    await deps.roleLlm("implementer", LAYOUT, (p) => wrote.push(p), []).act("go", {});
    const callbacks = asked[0].options;
    const verdict = await callbacks.onToolCall({ name: "file_write", input: { path: `${ROOT}/src/a.ts`, content: "x" } });
    strictEqual(verdict, "allow");
    await callbacks.onToolResult({ name: "file_write", input: { path: `${ROOT}/src/a.ts`, content: "x" } }, { success: true });
    deepStrictEqual(wrote, ["/workspace/src/a.ts"]);
  });

  it("verifyDeps offers the audit's act the auditor's tools alone, never the batch agent's write tools", async () => {
    const { ctx, asked } = context();
    const verify = m.verifyDeps(ctx, { hooks: [], effort: undefined, memoryOn: true, validationSlot: undefined, root: ROOT });
    await verify.llm.act("Audit F2", {});
    deepStrictEqual(asked.at(-1)!.options?.tools,
      ["file_read", "node_read", "codebase_search", "symbol_detail", "symbol_source", "run_validation", "memory_recall"]);
    await verify.llm.act("Audit F2", { tools: ["file_read"] });
    deepStrictEqual(asked.at(-1)!.options?.tools, ["file_read"]);
  });

  it("verifyDeps wraps the plain Llm when the crew asks (its background auditor), and harvests after GAPS only when asked", () => {
    const { ctx } = context();
    const marker = { act: async () => "child", complete: async () => "", extract: async () => ({}), permissionGateEnabled: () => undefined };
    const wrapped = m.verifyDeps(ctx, { hooks: [], effort: undefined, memoryOn: false, validationSlot: undefined, wrapLlm: () => marker, harvest: true });
    strictEqual(wrapped.llm, marker);
    strictEqual(typeof wrapped.harvest, "function");
    strictEqual(m.verifyDeps(ctx, { hooks: [], effort: undefined, memoryOn: false, validationSlot: undefined, root: ROOT }).harvest, undefined);
  });
});

describe("createSpend and spendGuard", () => {
  it("lets calls through up to the bound, then denies each one, the batch's spend counted", async () => {
    const spend = m.createSpend(2);
    let reached = 0;
    const callbacks = m.spendGuard({
      forAct: (_mode: string, _gate: boolean | undefined) => ({
        onToolCall: async (_call: { name: string; input: unknown }) => { reached++; return "allow" as const; },
        onToolResult: async () => undefined,
      }),
    }, spend);
    const act = callbacks.forAct("bypassPermissions", undefined);
    strictEqual(await act.onToolCall({ name: "file_read", input: {} }), "allow");
    strictEqual(await act.onToolCall({ name: "file_read", input: {} }), "allow");
    deepStrictEqual(await act.onToolCall({ name: "file_read", input: {} }),
      { deny: "budget: this batch has spent its 2 tool calls; end the act and say what is left" });
    deepStrictEqual([reached, spend.calls(), spend.exhausted()], [2, 2, true]);
  });

  it("is not spent by a batch whose calls reached the bound with none denied", async () => {
    const spend = m.createSpend(2);
    const act = m.spendGuard({
      forAct: (_mode: string, _gate: boolean | undefined) => ({
        onToolCall: async (_call: { name: string; input: unknown }) => "allow" as const, onToolResult: async () => undefined,
      }),
    }, spend).forAct("bypassPermissions", undefined);
    await act.onToolCall({ name: "file_read", input: {} });
    await act.onToolCall({ name: "file_read", input: {} });
    deepStrictEqual([spend.calls(), spend.exhausted()], [2, false]);
  });

  it("is the callbacks themselves without a spend", () => {
    const callbacks = { forAct: () => ({ onToolCall: async () => "allow" as const, onToolResult: async () => undefined }) };
    strictEqual(m.spendGuard(callbacks, undefined), callbacks);
  });
});

/** A builder that records each tool's name and builds one whose execute calls the body. */
function recorder(): () => ToolBuilder<unknown, unknown> {
  return () => {
    const b: { name?: string; fn?: (input: unknown) => unknown } = {};
    const api: any = {
      name: (v: string) => { b.name = v; return api; },
      description: () => api, withSchema: () => api, access: () => api,
      execute: (fn: (input: unknown) => unknown) => { b.fn = fn; return api; },
      build: () => ({ name: b.name, execute: (input: unknown) => b.fn!(input) }),
    };
    return api as ToolBuilder<unknown, unknown>;
  };
}

describe("batchAgentParts", () => {
  it("gives each batch agent its own slots and spend: two audits at once each reach their own run_validation runner", async () => {
    const parts = ["F2", "F3"].map((b) => m.batchAgentParts(recorder(), { root: `/workspace/.orkeon/worktrees/prune-${b}`, toolCalls: 5, memoryOn: false }));
    const seen: string[] = [];
    const releases = parts.map((p, i) => p.validationSlot.bind({
      async run(command) {
        seen.push(`${i === 0 ? "F2" : "F3"} ${command}`);
        return { report: { command, outcome: "exit 0", tail: "" }, line: "" };
      },
    }));
    const validation = (p: (typeof parts)[number]) => p.tools.find((t) => (t as { name?: string }).name === "run_validation")!;
    await Promise.all([validation(parts[0]).execute({ command: "npm test" }), validation(parts[1]).execute({ command: "npm run build" })]);
    deepStrictEqual(seen.sort(), ["F2 npm test", "F3 npm run build"]);
    releases.forEach((r) => r());
    parts[0].spend.take();
    deepStrictEqual([parts[0].spend.calls(), parts[1].spend.calls()], [1, 0]);
    ok(parts[0].toolSlot !== parts[1].toolSlot && parts[0].bodyTools !== parts[1].bodyTools);
    deepStrictEqual(parts[0].tools.map((t) => (t as { name?: string }).name), ["run_tests", "run_build", "run_validation"]);
    deepStrictEqual(m.batchAgentParts(recorder(), { root: "/r", toolCalls: 1, memoryOn: true }).tools.map((t) => (t as { name?: string }).name),
      ["run_tests", "run_build", "run_validation", "memory_recall"]);
  });
});

describe("agentTools", () => {
  it("builds memory_recall's ports over the tools its body bound", async () => {
    const { ctx, tools } = context();
    const holder = m.agentTools();
    holder.bind(ctx.tools);
    const ports = holder.memoryPorts(ROOT)();
    await ports.files.read("/workspace/.orkeon/memory/a.md");
    strictEqual((tools.inputsOf("fileRead")[0] as { path: string }).path, `${ROOT}/.orkeon/memory/a.md`);
  });
});

describe("gitTopUnder", () => {
  it("runs git under the root and answers its raw top, never mapped back to /workspace", async () => {
    const { ctx, tools } = context();
    tools.replies.shellCommand = { stdout: `${ROOT}\n`, stderr: "", exit_code: 0, success: true };
    deepStrictEqual(await m.gitTopUnder(ctx.tools, ROOT), { exitCode: 0, top: ROOT });
    deepStrictEqual(tools.inputsOf("shellCommand")[0], { command: "git rev-parse --show-toplevel", working_directory: ROOT });
  });
});
