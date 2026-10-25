// Saved agents and stored registries for the agent-registry tests.
import type { SavedAgent } from "./agent-registry.ts";

export const AGENT: SavedAgent = { name: "reviewer", role: "Reviewer", goal: "Review things", tools: [] };

/** Names that are no slug: the name is the file's key. */
export const BAD_NAMES: readonly string[] = ["", "9lives", "has space", "UPPER_SNAKE", "-lead"];

/** A stored map, out of name order. */
export const UNSORTED_REGISTRY = {
  zeta: { role: "Z", goal: "z" },
  alpha: { role: "A", goal: "a" },
};

/** A stored map with one good entry, one without its goal and one that is no object. */
export const REGISTRY_WITH_BROKEN = {
  good: { role: "R", goal: "G" },
  broken: { role: "R" },
  alsoBroken: "not an object",
};

/** Payloads that are no object. */
export const NOT_REGISTRIES: readonly unknown[] = [null, undefined, [], "x", 3];
