// memory_recall and memory_push over a recording builder and the fakes (M-5): the declared access,
// the schema keys a rule may name, the recall's shape, the push's candidate, its refusal in a
// read-only mode, and a throw turned into a refusal. Run:
//   node --test src/shared/infrastructure/orkeon/memory-tools.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual, ok } from "node:assert";

import { MEMORY_TOOLS, SCRIPT_TOOLS, TOOL_ARGUMENTS } from "../../domain/agent-policy/permission.ts";
import { MEMORY_PUSH, MEMORY_RECALL, memoryPushTool, memoryRecallTool, memoryTools } from "./memory-tools.ts";
import type { MemoryToolPorts } from "./memory-tools.ts";
import type { ToolBuilderFactory } from "./script-tools.ts";
import { memoryLayout } from "../../domain/shared-memory/layout.ts";
import { GIT_REMOTE_ORIGIN } from "../../application/shared-memory/memory-settings.ts";
import { FakeShell } from "../../../../tests/support/fake-shell.ts";
import { FakeSharedMemory } from "../../../../tests/doubles/fake-shared-memory.ts";
import { LiveListingFiles } from "../../../../tests/doubles/live-listing-files.ts";
import { entryText, sampleEntry } from "../../../../tests/doubles/memory-entries.ts";

interface Built { name?: string; schema?: JsonSchema; access?: string; fn?: (input: unknown) => unknown }

function recorder(): { builder: ToolBuilderFactory; built: Built[] } {
  const built: Built[] = [];
  const builder = () => {
    const b: Built = {};
    built.push(b);
    const api: any = {
      name: (v: string) => { b.name = v; return api; },
      description: () => api,
      withSchema: (v: JsonSchema) => { b.schema = v; return api; },
      access: (v: string) => { b.access = v; return api; },
      execute: (fn: (input: unknown) => unknown) => { b.fn = fn; return api; },
      build: () => ({ name: b.name, execute: (input: unknown) => b.fn!(input) }),
    };
    return api as ToolBuilder<unknown, unknown>;
  };
  return { builder, built };
}

const layout = memoryLayout(".orkeon/memory");

function world() {
  const files = new LiveListingFiles();
  const shell = new FakeShell();
  shell.results[GIT_REMOTE_ORIGIN] = { stdout: "git@example.com:acme/shop.git" };
  const memory = new FakeSharedMemory();
  const ports: MemoryToolPorts = {
    files, shell, memory, clock: () => new Date("2026-10-24T10:00:00Z"),
    config: { readValue: async (key: string) => ({ key, value: undefined, source: "unset" as const }) },
  };
  return { files, memory, ports: () => ports };
}

const run = (tool: Tool<unknown, unknown>, input: unknown) => (tool as any).execute(input) as Promise<any>;

describe("the memory tools", () => {
  it("declare the access of SCRIPT_TOOLS and a schema of the arguments a rule may name", () => {
    for (const [spec, make] of [[MEMORY_RECALL, memoryRecallTool], [MEMORY_PUSH, (b: ToolBuilderFactory, p: () => MemoryToolPorts) => memoryPushTool(b, p, "default")]] as const) {
      const r = recorder();
      make(r.builder, world().ports);
      strictEqual(r.built[0].access, SCRIPT_TOOLS.find((t) => t.name === spec.name)?.access);
      deepStrictEqual(Object.keys((r.built[0].schema as any).properties).sort(), [...TOOL_ARGUMENTS[spec.name]].sort());
    }
  });

  it("recall the admitted entries of the project's collection, in the output shape", async () => {
    const { files, memory, ports } = world();
    const kept = sampleEntry("mistake", "loop");
    const path = `${layout.entries}/mistake/${kept.id}.md`;
    files.files.set(path, entryText(kept));
    memory.hits = [{ sourceId: path, score: 0.8 }];
    const out = await run(memoryRecallTool(recorder().builder, ports), { query: "a retry loop", types: ["mistake", "bogus"], top_k: 2 });
    strictEqual(memory.searches[0].collection, "memory-shop");
    deepStrictEqual(out.entries.map((e: any) => [e.id, e.status, e.detection_signal, e.path, e.score]),
      [[kept.id, "admitted", "a red test on the edge case", path, 0.8]]);
    strictEqual(out.truncated, false);
    ok(!(await run(memoryRecallTool(recorder().builder, ports), {})).ok);
  });

  it("push a candidate, and refuse in a read-only mode with nothing written", async () => {
    const input = {
      type: "decision", title: "Keep the ports narrow", topic: "narrow ports", applies_when: "a use case needs a port",
      rationale: "wide ports leaked", evidence: ["src/shared/application/ports.ts:45"],
    };
    const { files, ports } = world();
    const out = await run(memoryPushTool(recorder().builder, ports, "acceptEdits"), input);
    deepStrictEqual(out, { candidate_path: `${layout.candidates}/shop-decision-20261024-keep-the-ports-narrow.md`, id: "shop-decision-20261024-keep-the-ports-narrow", status: "candidate" });
    ok(files.files.has(out.candidate_path));
    const plan = world();
    const refused = await run(memoryPushTool(recorder().builder, plan.ports, "plan"), input);
    ok(refused.refused.includes("mode 'plan' writes nothing"));
    strictEqual(plan.files.writes.length, 0);
    const invalid = await run(memoryPushTool(recorder().builder, ports, "default"), { ...input, evidence: [] });
    ok(invalid.refused.includes("evidence required"));
  });

  it("turn a failing port into a refusal, never a throw", async () => {
    const { memory, ports } = world();
    memory.searchFailure = new Error("rag: collection missing\nat x");
    const out = await run(memoryRecallTool(recorder().builder, ports), { query: "x" });
    deepStrictEqual(out, { ok: false, refused: "memory_recall failed: rag: collection missing" });
  });

  it("build the tools of the names offered, and only those", () => {
    const r = recorder();
    const tools = memoryTools(r.builder, world().ports, "plan", ["memory_recall", "run_tests"]);
    deepStrictEqual(tools.map((t: any) => t.name), ["memory_recall"]);
    deepStrictEqual(memoryTools(recorder().builder, world().ports, "default", MEMORY_TOOLS).map((t: any) => t.name), [...MEMORY_TOOLS]);
  });
});
