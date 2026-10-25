// The payload shapes the harvest tests render, as captured live 2026-08-06.

export const MODULE_GRAPH = {
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

export const SYMBOLS = [
  { fqn: "/workspace/src/index.ts::greet", name: "greet", kind: "function" },
  { fqn: "/workspace/src/math.ts::add", name: "add", kind: "function" },
  { fqn: "/workspace/src/types.ts::Order", name: "Order", kind: "class" },
];

export const PACKAGES = [{
  fqn: "/workspace::workspace", name: "workspace", files: 3, symbols: 6, dependencies: [],
}];

export interface EndpointCase {
  name: string;
  endpoint: string;
  path: string;
}

/** Edge endpoints and the paths they stand for. */
export const ENDPOINTS: readonly EndpointCase[] = [
  { name: "strips the node-ID suffix the live capture surfaced", endpoint: "/workspace/src/index.ts#module@0", path: "/workspace/src/index.ts" },
  { name: "leaves a plain path as it is", endpoint: "/workspace/src/plain.ts", path: "/workspace/src/plain.ts" },
];

/** `count` function symbols, one per file. */
export function manySymbols(count: number) {
  return Array.from({ length: count }, (_, i) => ({ fqn: `/w/f${i}.ts::s${i}`, name: `s${i}`, kind: "function" }));
}
