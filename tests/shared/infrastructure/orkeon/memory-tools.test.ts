// memory_recall and memory_push over a recording builder and the fakes (M-5): the declared access,
// the schema keys a rule may name, the recall's shape, the push's candidate, its refusal in a
// read-only mode, and a throw turned into a refusal. Run:
//   node --test tests/shared/infrastructure/orkeon/memory-tools.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual, ok } from "node:assert";

import { MEMORY_TOOLS, SCRIPT_TOOLS, TOOL_ARGUMENTS } from "../../../../src/shared/domain/agent-policy/permission.ts";
import { memoryPushTool, memoryRecallTool, memoryRecallTools, memoryTools } from "../../../../src/shared/infrastructure/orkeon/memory-tools.ts";
import {
  DECISION, DECISION_CANDIDATE, MEMORY_TOOL_SPECS, ROOT, run, world, worldWithEntry,
} from "./memory-tools.fixtures.ts";
import { recorder } from "../../../support/fixtures/tool-recorder.ts";
import { assertRefusedWith } from "./memory-tools.assertions.ts";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";

describe("the memory tools", () => {
  for (const { spec, make } of MEMORY_TOOL_SPECS) {
    it(`declare the access of SCRIPT_TOOLS and a schema of the arguments a rule may name: ${spec.name}`, () => {
      // Arrange
      const r = recorder();

      // Act
      make(r.builder, world().ports);

      // Assert
      strictEqual(r.built[0].access, SCRIPT_TOOLS.find((t) => t.name === spec.name)?.access);
      deepStrictEqual(Object.keys((r.built[0].schema as any).properties).sort(), [...TOOL_ARGUMENTS[spec.name]].sort());
    });
  }

  it("recall the admitted entries of the project's collection, in the output shape", async () => {
    // Arrange
    const { memory, ports, kept, path } = worldWithEntry();

    // Act
    const out = await run(memoryRecallTool(recorder().builder, ports), { query: "a retry loop", types: ["mistake", "bogus"], top_k: 2 });

    // Assert
    strictEqual(memory.searches[0].collection, "memory-shop");
    deepStrictEqual(out.entries.map((e: any) => [e.id, e.status, e.detection_signal, e.path, e.score]),
      [[kept.id, "admitted", "a red test on the edge case", path, 0.8]]);
    strictEqual(out.truncated, false);
  });

  it("refuse a recall without a query", async () => {
    // Arrange
    const { ports } = worldWithEntry();

    // Act
    const out = await run(memoryRecallTool(recorder().builder, ports), {});

    // Assert
    ok(!out.ok, `a recall without a query answered ${JSON.stringify(out)}`);
  });

  it("recall under a working root names each entry's file under the root (outbound)", async () => {
    // Arrange
    const { ports, path } = worldWithEntry();

    // Act
    const out = await run(memoryRecallTool(recorder().builder, ports, ROOT), { query: "a retry loop" });

    // Assert
    strictEqual(out.entries[0].path, path.replace(WORKSPACE, ROOT));
  });

  it("build the one recall tool when it is on under a working root", () => {
    // Arrange
    const { ports } = worldWithEntry();

    // Act
    const tools = memoryRecallTools(recorder().builder, ports, true, ROOT);

    // Assert
    strictEqual(JSON.stringify(tools.length), "1");
  });

  it("push a candidate", async () => {
    // Arrange
    const { files, ports } = world();

    // Act
    const out = await run(memoryPushTool(recorder().builder, ports, "acceptEdits"), DECISION);

    // Assert
    deepStrictEqual(out, DECISION_CANDIDATE);
    ok(files.files.has(out.candidate_path), `no candidate written at ${out.candidate_path}`);
  });

  it("refuse a push in a read-only mode with nothing written", async () => {
    // Arrange
    const plan = world();

    // Act
    const refused = await run(memoryPushTool(recorder().builder, plan.ports, "plan"), DECISION);

    // Assert
    assertRefusedWith(refused, "mode 'plan' writes nothing");
    strictEqual(plan.files.writes.length, 0);
  });

  it("refuse a push without evidence", async () => {
    // Arrange
    const { ports } = world();

    // Act
    const invalid = await run(memoryPushTool(recorder().builder, ports, "default"), { ...DECISION, evidence: [] });

    // Assert
    assertRefusedWith(invalid, "evidence required");
  });

  it("turn a failing port into a refusal, never a throw", async () => {
    // Arrange
    const { memory, ports } = world();
    memory.searchFailure = new Error("rag: collection missing\nat x");

    // Act
    const out = await run(memoryRecallTool(recorder().builder, ports), { query: "x" });

    // Assert
    deepStrictEqual(out, { ok: false, refused: "memory_recall failed: rag: collection missing" });
  });

  it("build the tools of the names offered, and only those", () => {
    // Arrange
    const names = ["memory_recall", "run_tests"];

    // Act
    const tools = memoryTools(recorder().builder, world().ports, "plan", names);

    // Assert
    deepStrictEqual(tools.map((t: any) => t.name), ["memory_recall"]);
  });

  it("build every memory tool when all are offered", () => {
    // Arrange
    const names = MEMORY_TOOLS;

    // Act
    const tools = memoryTools(recorder().builder, world().ports, "default", names);

    // Assert
    deepStrictEqual(tools.map((t: any) => t.name), [...MEMORY_TOOLS]);
  });
});
