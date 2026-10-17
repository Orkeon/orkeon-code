// /analyze — harvest rendering tests, on the payload shapes captured live
// 2026-08-06 (see docs/b14-codeintel-probe-transcript.md). Run:
//   node_modules/.bin/tsx --test crews/analyze/domain/harvest.test.ts
import { describe, it } from "node:test";
import { strictEqual, ok } from "node:assert";

import {
  MAX_HARVEST_SYMBOLS, edgeEndpointToPath, groupByKind, renderHarvest,
  SYNTHESIS_SYSTEM, buildSynthesisUser,
} from "./harvest.ts";

const MODULE_GRAPH = {
  nodes: [
    { fqn: "/workspace/src/index.ts", name: "index.ts", kind: "module" },
    { fqn: "/workspace/src/math.ts", name: "math.ts", kind: "module" },
  ],
  // From the live capture: endpoints are node IDs, kind is the numeric enum.
  edges: [{ from: "/workspace/src/index.ts#module@0", to: "/workspace/src/math.ts#module@0", kind: "1" }],
  nodeCount: 2,
  edgeCount: 1,
  cycleCount: 0,
};

const SYMBOLS = [
  { fqn: "/workspace/src/index.ts::greet", name: "greet", kind: "function" },
  { fqn: "/workspace/src/math.ts::add", name: "add", kind: "function" },
  { fqn: "/workspace/src/types.ts::Order", name: "Order", kind: "class" },
];

const PACKAGES = [{
  fqn: "/workspace::workspace", name: "workspace", files: 3, symbols: 6, dependencies: [],
}];

describe("edgeEndpointToPath", () => {
  it("strips the node-ID suffix the live capture surfaced", () => {
    strictEqual(edgeEndpointToPath("/workspace/src/index.ts#module@0"), "/workspace/src/index.ts");
    strictEqual(edgeEndpointToPath("/workspace/src/plain.ts"), "/workspace/src/plain.ts");
  });
});

describe("groupByKind", () => {
  it("groups by kind, first-seen order, unknown kinds bucketed", () => {
    const groups = groupByKind([...SYMBOLS, { fqn: "x::y", name: "y", kind: "" }]);
    strictEqual(groups[0]!.kind, "function");
    strictEqual(groups[0]!.entries.length, 2);
    strictEqual(groups[1]!.kind, "class");
    strictEqual(groups[2]!.kind, "unknown");
  });
});

describe("renderHarvest", () => {
  const harvest = renderHarvest({
    packages: PACKAGES, moduleGraph: MODULE_GRAPH, symbols: SYMBOLS, symbolCount: 6,
  });

  it("renders packages, module edges (as paths) and symbols by kind", () => {
    ok(harvest.includes("`/workspace::workspace` — 3 file(s), 6 symbol(s)"), harvest);
    ok(harvest.includes("/workspace/src/index.ts → /workspace/src/math.ts"), "edge endpoints must render as paths");
    ok(!harvest.includes("#module@"), "node IDs must not leak into the rendering");
    ok(harvest.includes("### function (2)"), harvest);
    ok(harvest.includes("### class (1)"), harvest);
    ok(harvest.includes("`/workspace/src/types.ts::Order`"), harvest);
  });

  it("says the total even when the listing is capped", () => {
    const many = Array.from({ length: MAX_HARVEST_SYMBOLS + 20 }, (_, i) => ({
      fqn: `/w/f${i}.ts::s${i}`, name: `s${i}`, kind: "function",
    }));
    const capped = renderHarvest({
      packages: [], moduleGraph: { ...MODULE_GRAPH, edges: [] }, symbols: many,
      symbolCount: many.length,
    });
    ok(capped.includes(`${MAX_HARVEST_SYMBOLS + 20} total`), "the authoritative count survives the cap");
    ok(capped.includes("20 more symbol(s) omitted"), "a silent cut would read as the codebase ending there");
  });

  it("flags cycles — the one graph finding that is always a risk", () => {
    const cyclic = renderHarvest({
      packages: [], symbols: [], symbolCount: 0,
      moduleGraph: { ...MODULE_GRAPH, cycleCount: 2 },
    });
    ok(cyclic.includes("2 cycle(s) ⚠"), cyclic);
  });
});

describe("the synthesis prompts", () => {
  it("the system prompt forbids inventing symbols and demands FQN citations", () => {
    ok(SYNTHESIS_SYSTEM.includes("ONLY from the harvest"));
    ok(SYNTHESIS_SYSTEM.includes("FQN"));
  });

  it("the user body carries the ask THEN the harvest", () => {
    const user = buildSynthesisUser("# Codebase analysis harvest\nX");
    ok(user.includes("business/domain objects"));
    ok(user.indexOf("business/domain objects") < user.indexOf("# Codebase analysis harvest"));
    ok(user.endsWith("<harvest>\n# Codebase analysis harvest\nX\n</harvest>"), "the harvest is material");
  });

  it("asks to say what the harvest does not hold rather than fill it, and to mark inferences", () => {
    ok(buildSynthesisUser("X").includes("not in the harvest"));
    ok(SYNTHESIS_SYSTEM.includes("word an inference as one"));
  });
});
