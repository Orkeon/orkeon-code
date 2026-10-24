// briefInventory over FakeCodeIndex: the index built when empty, each phrase searched, hits located and kept once,
// the work folder and .claude/ left out, a failing index a warning. Run:
//   node --test src/shared/application/dev/brief-inventory.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { FakeCodeIndex } from "../../../../tests/support/fake-code-index.ts";
import { briefInventory, briefPhrases, renderBriefInventory } from "./brief-inventory.ts";

describe("briefPhrases", () => {
  it("takes the code's words, then distinct lines and sentences, at most six", () => {
    deepStrictEqual(briefPhrases("memory-prune", "Remove old entries. Keep feedback!\n# Remove old entries."),
      ["memory prune", "Remove old entries.", "Keep feedback!"]);
    strictEqual(briefPhrases("x", "a1 b. a2 c. a3 d. a4 e. a5 f. a6 g. a7 h.").length, 6);
  });
});

describe("briefInventory", () => {
  it("locates each hit once and leaves out the excluded folders", async () => {
    const index = new FakeCodeIndex();
    index.roots = 0;
    const fqn = "/workspace/src/memory.ts::prune";
    index.hits = {
      "memory prune": [{ fqn, score: 0.9, origin: "symbol" }, { fqn: "/workspace/workbench/prune/SPEC-prune.md::x", score: 0.5, origin: "text" }],
      "Remove old entries.": [{ fqn, score: 0.8, origin: "symbol" }, { fqn: "/workspace/.claude/rules/a.md::r", score: 0.4, origin: "text" }],
    };
    index.sources[fqn] = { fqn, path: "/workspace/src/memory.ts", startLine: 12, endLine: 30, language: "ts", firstLine: "export function prune" };
    const inv = await briefInventory(index, { phrases: ["memory prune", "Remove old entries."], excluded: ["workbench"] });
    deepStrictEqual(inv.entries, [{ path: "src/memory.ts", line: 12, name: "prune" }]);
    strictEqual(renderBriefInventory(inv), "- src/memory.ts:12 — prune");
    deepStrictEqual(inv.warnings, []);
  });

  it("returns a warning and no entry when the index fails", async () => {
    const index = new FakeCodeIndex();
    index.failure = new Error("no index");
    const inv = await briefInventory(index, { phrases: ["x y z"], excluded: [] });
    deepStrictEqual(inv.entries, []);
    ok(inv.warnings[0].startsWith("the code index is not available (no index)"));
    strictEqual(renderBriefInventory(inv), "(the index found nothing for this request)");
  });
});
