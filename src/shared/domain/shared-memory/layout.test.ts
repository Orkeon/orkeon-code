// The shared memory's folder layout and collection name (M-2). Run:
//   node --test src/shared/domain/shared-memory/layout.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { candidatePath, checkMemoryDir, entryPath, memoryCollection, memoryLayout } from "./layout.ts";

describe("memoryLayout", () => {
  it("places every file of the layout under /workspace/<memory.dir>", () => {
    deepStrictEqual(memoryLayout(".orkeon/memory"), {
      root: "/workspace/.orkeon/memory",
      candidates: "/workspace/.orkeon/memory/candidates",
      candidatesList: "/workspace/.orkeon/memory/candidates/CANDIDATES.md",
      entries: "/workspace/.orkeon/memory/entries",
      refused: "/workspace/.orkeon/memory/refused.md",
      index: "/workspace/.orkeon/memory/INDEX.md",
      golden: "/workspace/.orkeon/memory/eval/golden.yaml",
      entriesGlob: "/workspace/.orkeon/memory/entries/**/*.md",
    });
    strictEqual(candidatePath(memoryLayout("m"), "x-method-20261024-a"), "/workspace/m/candidates/x-method-20261024-a.md");
    strictEqual(entryPath(memoryLayout("m"), "mistake", "x-mistake-20261024-a"), "/workspace/m/entries/mistake/x-mistake-20261024-a.md");
  });

  it("names one collection per project", () => strictEqual(memoryCollection("orkeon-code"), "memory-orkeon-code"));
});

describe("checkMemoryDir", () => {
  it("normalises a relative folder", () => {
    deepStrictEqual(checkMemoryDir("./.orkeon/memory/"), { ok: true, dir: ".orkeon/memory" });
  });

  it("keeps the agent memory apart: neither it, a folder inside it, nor one that holds it", () => {
    for (const dir of [".orkeon/agent-memory", ".orkeon/agent-memory/shared", ".orkeon"]) {
      strictEqual(checkMemoryDir(dir).ok, false, dir);
    }
    strictEqual(checkMemoryDir(".orkeon/agent-memory-x").ok, true);
  });
});
