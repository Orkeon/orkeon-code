// @orkeon-script 1.0
/// <reference path="../.orkeon/orkeon.d.ts" />
// Deterministic RaggableTree probe (no LLM): builds the semantic index of /workspace with
// languages auto-detected (none pinned), then queries the symbol-level map. Proves the
// index_codebase → codebase_map tool path end-to-end on whatever codebase is mounted.

const probe = (globalThis as any).agentBuilder()
  .name("probe")
  .role("RaggableTree probe")
  .goal("Index the mounted workspace and dump its structural map deterministically.")
  .tools(["index_codebase", "codebase_map"])
  .body(async (_input: any, _ctx: any) => {
    const t = (globalThis as any).tools;
    const idx = await t.indexCodebase({ root_path: "/workspace" }); // languages omitted → auto-detect
    const symbols = await t.codebaseMap({ level: "L3_Symbol", include_metrics: true });
    return JSON.stringify({ index: idx, symbols }, null, 2);
  })
  .build();

(globalThis as any).crew = (globalThis as any).crewBuilder()
  .name("probe-raggable")
  .process("sequential")
  .withAgent(probe)
  .build();
