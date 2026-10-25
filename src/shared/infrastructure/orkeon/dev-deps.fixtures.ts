// The dev crews' ports under test, loaded once the runtime's globals throw, and the body's context, layout, working
// root and builders the dev-deps tests run on.
import { FakeTools } from "../../../../tests/support/fake-tools.ts";
import { FakeLogger } from "../../../../tests/support/fake-logger.ts";
import { WORKSPACE } from "../../domain/vfs.ts";

type Module = typeof import("./dev-deps.ts");

/** A global that throws on any reach: a property read or a call. */
const throwing = (name: string) => new Proxy(() => undefined, {
  get: (_t, key) => { throw new Error(`the global ${name}.${String(key)} was reached`); },
  apply: () => { throw new Error(`the global ${name}() was reached`); },
});

/** dev-deps.ts, loaded after the runtime's globals are set to throw: the module is cached after the first load. */
export async function loadDevDeps(): Promise<Module> {
  const g = globalThis as Record<string, unknown>;
  for (const name of ["tools", "agentBuilder", "crewBuilder", "toolBuilder"]) g[name] = throwing(name);
  return await import("./dev-deps.ts");
}

export const ROOT = `${WORKSPACE}/.orkeon/worktrees/prune-F2`;

export const LAYOUT = { domain: "src/domain", application: "src/application", tests: "tests", shared: [], buildOutputs: [] };

/** A body's context: its own tools, and an llm that keeps what it was asked. */
export function context() {
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

/** A brief quoting a /workspace constant and a fenced diff, and the same brief sent under ROOT. */
export const QUOTING_BRIEF = `Step 1 of ${WORKSPACE}/todo/prune/PRUNE-PLAN-F2.md: keep \`const WORKING_DIRECTORY = "${WORKSPACE}";\`\n\`\`\`diff\n+ cd ${WORKSPACE}\n\`\`\``;
export const QUOTING_BRIEF_ROOTED =
  `Step 1 of ${ROOT}/todo/prune/PRUNE-PLAN-F2.md: keep \`const WORKING_DIRECTORY = "${WORKSPACE}";\`\n\`\`\`diff\n+ cd ${WORKSPACE}\n\`\`\``;

/** The tools verifyDeps offers the audit's act when the act names none. */
export const AUDITOR_TOOLS = ["file_read", "node_read", "codebase_search", "symbol_detail", "symbol_source", "run_validation", "memory_recall"];

/** The implementer's act under ROOT, its callbacks as the llm received them, and the logical paths reported written. */
export async function rootedImplementerCallbacks() {
  const m = await loadDevDeps();
  const { ctx, asked } = context();
  const wrote: string[] = [];
  const deps = m.implementDeps(ctx, { hooks: [], effort: undefined, memoryOn: false, toolSlot: undefined, root: ROOT });
  await deps.roleLlm("implementer", LAYOUT, (p) => wrote.push(p), []).act("go", {});
  return { callbacks: asked[0].options, wrote };
}

/** A file_write call under ROOT. */
export const ROOTED_WRITE = { name: "file_write", input: { path: `${ROOT}/src/a.ts`, content: "x" } };

/** The act of a spend guard of `bound` calls over callbacks that allow every call, counting the calls they reached. */
export async function guardedAct(bound: number) {
  const m = await loadDevDeps();
  const spend = m.createSpend(bound);
  const counter = { reached: 0 };
  const act = m.spendGuard({
    forAct: (_mode: string, _gate: boolean | undefined) => ({
      onToolCall: async (_call: { name: string; input: unknown }) => { counter.reached++; return "allow" as const; },
      onToolResult: async () => undefined,
    }),
  }, spend).forAct("bypassPermissions", undefined);
  return { spend, act, counter };
}

export const FILE_READ_CALL = { name: "file_read", input: {} };

/** A builder that records each tool's name and builds one whose execute calls the body. */
export function recorder(): () => ToolBuilder<unknown, unknown> {
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

/** The parts of the batch agents of F2 and F3, each under its own worktree, 5 tool calls each. */
export async function twoBatchParts() {
  const m = await loadDevDeps();
  return ["F2", "F3"].map((b) => m.batchAgentParts(recorder(), { root: `${WORKSPACE}/.orkeon/worktrees/prune-${b}`, toolCalls: 5, memoryOn: false }));
}

/** The names of the tools a batch agent's parts carry. */
export function toolNames(parts: { tools: unknown[] }): Array<string | undefined> {
  return parts.tools.map((t) => (t as { name?: string }).name);
}

/** The run_validation tool of a batch agent's parts. */
export function validationTool(parts: { tools: unknown[] }): { execute: (input: unknown) => unknown } {
  return parts.tools.find((t) => (t as { name?: string }).name === "run_validation") as { execute: (input: unknown) => unknown };
}
