// Unit tests for the inventory's pure part: the hits kept, the layer of a path, and the
// lines the planner's prompt shows. Run:
//   node --test src/crews/dev-plan/domain/inventory-model.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";

import { INVENTORY_CAPS, keepPath, layerOf, renderInventory } from "./inventory-model.ts";
import type { Inventory, InventoryEntry } from "./inventory-model.ts";

const INVENTORY: Inventory = JSON.parse(readFileSync(new URL("../../../../tests/fixtures/dev/plan/inventory.json", import.meta.url), "utf8"));

describe("INVENTORY_CAPS", () => {
  it("holds the caps of the design", () => {
    deepStrictEqual({ ...INVENTORY_CAPS }, {
      titles: 20, topK: 8, hitsPerTitle: 3, entries: 24, impacts: 12, callers: 5, imports: 5, graphNodes: 300,
      promptChars: 8_000, lineChars: 400,
    });
  });
});

describe("keepPath", () => {
  it("keeps a repository file as a relative path", () => {
    strictEqual(keepPath("/workspace/src/shared/domain/memory.ts", ["workbench"], []), "src/shared/domain/memory.ts");
  });
  it("drops a path outside the repository and the folders a plan never anchors", () => {
    for (const p of [
      "/tmp/x.ts", "/workspacex/a.ts", "/workspace/.claude/skills/a.md", "/workspace/.orkeon/repo.yaml",
      "/workspace/node_modules/x/index.js", "/workspace/.git/HEAD", "/workspace/workbench/prune/SPEC-prune.md",
    ]) strictEqual(keepPath(p, ["workbench"], []), null, p);
  });
  it("reads an excluded folder given relative, absolute or with slashes", () => {
    strictEqual(keepPath("/workspace/backstage/tasks/a.md", ["/workspace/backstage/tasks/"], []), null);
    strictEqual(keepPath("/workspace/backstage/tasks/a.md", ["backstage/tasks"], []), null);
    strictEqual(keepPath("/workspace/backstage/taskset/a.md", ["backstage/tasks"], []), "backstage/taskset/a.md");
  });
  it("drops a path with a segment named as a build output, not a name that only starts like one", () => {
    strictEqual(keepPath("/workspace/src/App/bin/Debug/a.cs", [], ["bin", "obj"]), null);
    strictEqual(keepPath("/workspace/dist/a.js", [], ["dist"]), null);
    strictEqual(keepPath("/workspace/src/binder/a.ts", [], ["bin"]), "src/binder/a.ts");
  });
});

describe("layerOf", () => {
  const layout = { domain: "src/shared/domain", application: "src/shared", infrastructure: "src/shared/infrastructure/", tests: "tests" };
  it("picks the longest root prefixing the path", () => {
    strictEqual(layerOf("src/shared/domain/memory.ts", layout), "domain");
    strictEqual(layerOf("src/shared/application/ports.ts", layout), "application");
    strictEqual(layerOf("src/shared/infrastructure/fs.ts", layout), "infrastructure");
    strictEqual(layerOf("tests/support/fake.ts", layout), "tests");
  });
  it("matches whole segments only, and gives other without a root or a layout", () => {
    strictEqual(layerOf("testsuite/a.ts", layout), "other");
    strictEqual(layerOf("docs/commands.md", layout), "other");
    strictEqual(layerOf("src/a.ts", null), "other");
    strictEqual(layerOf("src/a.ts", {}), "other");
  });
});

describe("renderInventory", () => {
  it("writes one line per entry, its declaration word, layer, ids, callers and imports", () => {
    const { text, shown } = renderInventory(INVENTORY, INVENTORY_CAPS.promptChars);
    const lines = text.split("\n");
    strictEqual(lines.length, 5);
    strictEqual(lines[1], "I2 · src/commands/_lib/memory.ts:40 · function runMemory · layer other · for UC-01, BR-03 · " +
      "callers: src/commands/memory.cmd.ts::run · imports: src/shared/domain/memory.ts · " +
      "export async function runMemory(tokens: string[], deps: MemoryDeps): Promise<CommandView> {");
    strictEqual(lines[0], "I1 · src/shared/domain/memory.ts:18 · interface MemoryEntry · layer domain · for UC-01, BR-01, BR-02 · export interface MemoryEntry {");
    deepStrictEqual([...shown], ["I1", "I2", "I3", "I4", "I5"]);
  });
  it("cuts a line at the line cap", () => {
    const long: InventoryEntry = { ...INVENTORY.entries[0], firstLine: `export const x = "${"y".repeat(600)}";` };
    const { text } = renderInventory({ ...INVENTORY, entries: [long] }, INVENTORY_CAPS.promptChars);
    strictEqual(text.length, INVENTORY_CAPS.lineChars);
  });
  it("counts the entries past the character cap and leaves them out of the shown refs", () => {
    const first = renderInventory(INVENTORY, 10_000).text.split("\n");
    const room = first[0].length + 1 + first[1].length;
    const { text, shown } = renderInventory(INVENTORY, room);
    deepStrictEqual(text.split("\n"), [first[0], first[1], "… 3 entries left out: they cannot be anchors"]);
    deepStrictEqual([...shown], ["I1", "I2"]);
  });
  it("says so when the inventory is empty", () => {
    const { text, shown } = renderInventory({ ...INVENTORY, entries: [] }, 8_000);
    strictEqual(text, "(the code index holds no symbol for these titles)");
    strictEqual(shown.size, 0);
  });
});
