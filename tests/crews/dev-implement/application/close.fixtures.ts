// The pack and the branch patterns the close is tested on.
import { parseRepoPack, type RepoPack } from "../../../../src/shared/domain/dev/repo-pack.ts";

/** A pack with two layer roots: `src/domain` and `tests`. */
export function twoLayerPack(): RepoPack {
  const parsed = parseRepoPack("layout:\n  domain: src/domain\n  tests: tests\n");
  if (!parsed.ok) throw new Error("pack");
  return parsed.pack;
}

/** A path under each root and one under none, in no order. */
export const MIXED_PATHS: readonly string[] = ["tests/a.test.ts", "src/domain/a.ts", "README.md"];

/** Their grouping: the roots in the pack's order, the rest last. */
export const MIXED_LAYERS = [
  { layer: "domain", paths: ["src/domain/a.ts"] },
  { layer: "tests", paths: ["tests/a.test.ts"] },
  { layer: "other", paths: ["README.md"] },
];

export interface BranchCase {
  name: string;
  pattern: string;
  feature: string;
  expected: string | null;
}

export const BRANCH_CASES: readonly BranchCase[] = [
  { name: "takes the pattern's first alternative before the slash, then <code>-f<n>", pattern: "feature|fix/<slug>", feature: "F2", expected: "feature/demo-f2" },
  { name: "takes a single prefix before the slash, then <code>-f<n>", pattern: "feat/<slug>", feature: "F1", expected: "feat/demo-f1" },
  { name: "names no branch for a pattern without a prefix", pattern: "<slug>", feature: "F1", expected: null },
];
