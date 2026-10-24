// The inventory of a plan run, its pure part: the entries the code index found for the
// titles of the source, which hits are kept, the layer each path belongs to, and the lines
// the planner's prompt shows. Only an entry shown can become an anchor. The searches
// themselves live in the application (inventory.ts); nothing here reads the index.

export type InventoryLayer = "domain" | "application" | "infrastructure" | "tests" | "other";
export interface InventoryEntry {
  ref: string;                 // "I1".."I24", in discovery order
  fqn: string; name: string;   // name: the part after "::" of the fqn, else the file name
  path: string;                // relative to /workspace
  line: number; endLine: number; language: string; firstLine: string;
  layer: InventoryLayer;       // by the longest layout root prefixing the path
  forIds: string[];            // the ids whose title found it, in source order
  score: number; origin: string;
  callers: string[];           // direct callers' fqns, relative, ≤ 5
  imports: string[];           // module paths this file imports (L2 graph), relative, ≤ 5
}
export interface Inventory {
  entries: InventoryEntry[];
  index: "present" | "built" | "empty";
  titlesSearched: number; calls: number;
  warnings: string[];
}

export const INVENTORY_CAPS = {
  titles: 20, topK: 8, hitsPerTitle: 3, entries: 24,
  impacts: 12, callers: 5, imports: 5, graphNodes: 300,
  promptChars: 8_000, lineChars: 400,
} as const;

const TOP = "/workspace/";
const ALWAYS_EXCLUDED = [".claude", ".orkeon", "node_modules", ".git"];
const EMPTY = "(the code index holds no symbol for these titles)";
const DECLARATION = /\b(function|class|interface|type|enum|const|let|var|def|struct|record|trait|module|namespace|method)\b/;

const asPrefix = (folder: string): string => {
  const f = folder.startsWith(TOP) ? folder.slice(TOP.length) : folder.replace(/^\/+/, "");
  return `${TOP}${f.replace(/\/+$/, "")}/`;
};

/** A hit kept: under /workspace, not under the excluded prefixes, not a build output. */
export function keepPath(absolute: string, excluded: readonly string[], buildOutputs: readonly string[]): string | null {
  if (!absolute.startsWith(TOP)) return null;
  const prefixes = [...ALWAYS_EXCLUDED, ...excluded].filter((f) => f.replace(/[/\s]/g, "") !== "").map(asPrefix);
  if (prefixes.some((p) => absolute.startsWith(p))) return null;
  const relative = absolute.slice(TOP.length);
  const outputs = new Set(buildOutputs.map((b) => b.replace(/^\/+|\/+$/g, "")).filter((b) => b !== ""));
  if (relative.split("/").some((segment) => outputs.has(segment))) return null;
  return relative === "" ? null : relative;
}

export function layerOf(
  path: string,
  layout: { domain?: string; application?: string; infrastructure?: string; tests?: string } | null,
): InventoryLayer {
  if (layout === null) return "other";
  let best: InventoryLayer = "other";
  let length = -1;
  for (const layer of ["domain", "application", "infrastructure", "tests"] as const) {
    const root = layout[layer]?.replace(/^\.?\/+/, "").replace(/\/+$/, "");
    if (root === undefined || root === "") continue;
    if ((path === root || path.startsWith(`${root}/`)) && root.length > length) { best = layer; length = root.length; }
  }
  return best;
}

function entryLine(e: InventoryEntry, lineChars: number): string {
  const kind = DECLARATION.exec(e.firstLine)?.[1] ?? "symbol";
  const parts = [`${e.ref}`, `${e.path}:${e.line}`, `${kind} ${e.name}`, `layer ${e.layer}`];
  if (e.forIds.length > 0) parts.push(`for ${e.forIds.join(", ")}`);
  if (e.callers.length > 0) parts.push(`callers: ${e.callers.join(", ")}`);
  if (e.imports.length > 0) parts.push(`imports: ${e.imports.join(", ")}`);
  parts.push(e.firstLine.trim());
  return parts.join(" · ").slice(0, lineChars);
}

/** The lines the prompt shows, and the refs shown; entries past `maxChars` are counted, not shown. */
export function renderInventory(inv: Inventory, maxChars: number): { text: string; shown: Set<string> } {
  const shown = new Set<string>();
  if (inv.entries.length === 0) return { text: EMPTY, shown };
  const lines: string[] = [];
  let used = 0;
  for (const e of inv.entries) {
    const line = entryLine(e, INVENTORY_CAPS.lineChars);
    const cost = line.length + (lines.length > 0 ? 1 : 0);
    if (used + cost > maxChars) break;
    lines.push(line);
    shown.add(e.ref);
    used += cost;
  }
  const left = inv.entries.length - lines.length;
  if (left > 0) lines.push(`… ${left} entries left out: they cannot be anchors`);
  return { text: lines.join("\n"), shown };
}
