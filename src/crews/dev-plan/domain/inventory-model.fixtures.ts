// The inventory and the case tables the inventory-model tests read.
import { readFileSync } from "node:fs";

import type { Inventory, InventoryEntry } from "./inventory-model.ts";

export const INVENTORY: Inventory = JSON.parse(readFileSync(new URL("../../../../tests/fixtures/dev/plan/inventory.json", import.meta.url), "utf8"));

export const DESIGN_CAPS = {
  titles: 20, topK: 8, hitsPerTitle: 3, entries: 24, impacts: 12, callers: 5, imports: 5, graphNodes: 300,
  promptChars: 8_000, lineChars: 400,
};

/** Paths outside the repository, or in a folder a plan never anchors (`workbench` excluded). */
export const DROPPED_PATHS: readonly string[] = [
  "/tmp/x.ts", "/workspacex/a.ts", "/workspace/.claude/skills/a.md", "/workspace/.orkeon/repo.yaml",
  "/workspace/node_modules/x/index.js", "/workspace/.git/HEAD", "/workspace/workbench/prune/SPEC-prune.md",
];

export interface KeepCase {
  name: string;
  path: string;
  excluded: string[];
  outputs: string[];
  kept: string | null;
}

/** An excluded folder given in several spellings, and a folder that only starts like it. */
export const EXCLUDED_SPELLINGS: readonly KeepCase[] = [
  { name: "drops a path under an excluded folder given absolute with slashes", path: "/workspace/backstage/tasks/a.md", excluded: ["/workspace/backstage/tasks/"], outputs: [], kept: null },
  { name: "drops a path under an excluded folder given relative", path: "/workspace/backstage/tasks/a.md", excluded: ["backstage/tasks"], outputs: [], kept: null },
  { name: "keeps a path under a folder that only starts like an excluded one", path: "/workspace/backstage/taskset/a.md", excluded: ["backstage/tasks"], outputs: [], kept: "backstage/taskset/a.md" },
];

/** Segments named as a build output, and a name that only starts like one. */
export const BUILD_OUTPUTS: readonly KeepCase[] = [
  { name: "drops a path with a nested segment named as a build output", path: "/workspace/src/App/bin/Debug/a.cs", excluded: [], outputs: ["bin", "obj"], kept: null },
  { name: "drops a path whose first segment is a build output", path: "/workspace/dist/a.js", excluded: [], outputs: ["dist"], kept: null },
  { name: "keeps a path whose segment only starts like a build output", path: "/workspace/src/binder/a.ts", excluded: [], outputs: ["bin"], kept: "src/binder/a.ts" },
];

export const LAYOUT = { domain: "src/shared/domain", application: "src/shared", infrastructure: "src/shared/infrastructure/", tests: "tests" };

export interface LayerCase {
  name: string;
  path: string;
  layout: Record<string, string> | null;
  layer: string;
}

/** Paths under a root of the layout: the longest root wins. */
export const LONGEST_ROOT: readonly LayerCase[] = [
  { name: "gives domain to a path under the domain root, inside the application one", path: "src/shared/domain/memory.ts", layout: LAYOUT, layer: "domain" },
  { name: "gives application to a path under the application root only", path: "src/shared/application/ports.ts", layout: LAYOUT, layer: "application" },
  { name: "gives infrastructure to a path under a root written with a trailing slash", path: "src/shared/infrastructure/fs.ts", layout: LAYOUT, layer: "infrastructure" },
  { name: "gives tests to a path under the tests root", path: "tests/support/fake.ts", layout: LAYOUT, layer: "tests" },
];

/** Paths no root holds: a name that only starts like a root, no root at all, no layout. */
export const NO_ROOT: readonly LayerCase[] = [
  { name: "gives other to a segment that only starts like a root", path: "testsuite/a.ts", layout: LAYOUT, layer: "other" },
  { name: "gives other to a path under no root", path: "docs/commands.md", layout: LAYOUT, layer: "other" },
  { name: "gives other without a layout", path: "src/a.ts", layout: null, layer: "other" },
  { name: "gives other with an empty layout", path: "src/a.ts", layout: {}, layer: "other" },
];

export const FIRST_LINE =
  "I1 · src/shared/domain/memory.ts:18 · interface MemoryEntry · layer domain · for UC-01, BR-01, BR-02 · export interface MemoryEntry {";

export const SECOND_LINE = "I2 · src/commands/_lib/memory.ts:40 · function runMemory · layer other · for UC-01, BR-03 · " +
  "callers: src/commands/memory.cmd.ts::run · imports: src/shared/domain/memory.ts · " +
  "export async function runMemory(tokens: string[], deps: MemoryDeps): Promise<CommandView> {";

/** The first entry, its first line 600 characters past the line cap. */
export const LONG_ENTRY: InventoryEntry = { ...INVENTORY.entries[0], firstLine: `export const x = "${"y".repeat(600)}";` };
