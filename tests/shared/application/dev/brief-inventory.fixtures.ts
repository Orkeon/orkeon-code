// The code index and the requests briefInventory is tested on.
import { FakeCodeIndex } from "../../../support/doubles/fake-code-index.ts";
import type { BriefInventoryRequest } from "../../../../src/shared/application/dev/brief-inventory.ts";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";

export const PRUNE_FQN = `${WORKSPACE}/src/memory.ts::prune`;

/** Two phrases, the work folder `workbench` excluded. */
export const PRUNE_REQUEST: BriefInventoryRequest = { phrases: ["memory prune", "Remove old entries."], excluded: ["workbench"] };

/** Seven sentences: one more than the phrases kept. */
export const SEVEN_SENTENCES = "a1 b. a2 c. a3 d. a4 e. a5 f. a6 g. a7 h.";

/**
 * An empty index whose two phrases both hit `prune` in src/memory.ts, the first also a spec of the work folder,
 * the second also a rule of .claude/.
 */
export function pruneIndex(): FakeCodeIndex {
  const index = new FakeCodeIndex();
  index.roots = 0;
  index.hits = {
    "memory prune": [{ fqn: PRUNE_FQN, score: 0.9, origin: "symbol" }, { fqn: `${WORKSPACE}/workbench/prune/SPEC-prune.md::x`, score: 0.5, origin: "text" }],
    "Remove old entries.": [{ fqn: PRUNE_FQN, score: 0.8, origin: "symbol" }, { fqn: `${WORKSPACE}/.claude/rules/a.md::r`, score: 0.4, origin: "text" }],
  };
  index.sources[PRUNE_FQN] = { fqn: PRUNE_FQN, path: `${WORKSPACE}/src/memory.ts`, startLine: 12, endLine: 30, language: "ts", firstLine: "export function prune" };
  return index;
}

/** An index every call of which throws "no index". */
export function failingIndex(): FakeCodeIndex {
  const index = new FakeCodeIndex();
  index.failure = new Error("no index");
  return index;
}

export const FAILING_REQUEST: BriefInventoryRequest = { phrases: ["x y z"], excluded: [] };

/** pruneIndex, its build answered from a refreshed cache that reindexed two files. */
export function refreshedPruneIndex(): FakeCodeIndex {
  const index = pruneIndex();
  index.indexed = { files: 4, nodes: 9, edges: 2, statements: 5, errors: [], cache: "refreshed", reindexed: 2 };
  return index;
}

/** pruneIndex with an index already present: nothing is built. */
export function presentPruneIndex(): FakeCodeIndex {
  const index = pruneIndex();
  index.roots = 1;
  index.indexed = { files: 4, nodes: 9, edges: 2, statements: 5, errors: [], cache: "hit", reindexed: 0 };
  return index;
}
