// The design-rule ids expected, and the provenance and prompt markers no rule may hold.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export interface Marker { source: string; flags: string }

const MARKERS = fileURLToPath(new URL("../../../../scripts/provenance-markers.json", import.meta.url));

/** The provenance and prompt markers of scripts/provenance-markers.json, together. */
export function readMarkers(): Marker[] {
  const markers = JSON.parse(readFileSync(MARKERS, "utf8")) as { markers: Marker[]; promptMarkers: Marker[] };
  return [...markers.markers, ...markers.promptMarkers];
}

/** The 17 ids, in order. */
export const EXPECTED_IDS: readonly string[] = [
  "DDD-01", "DDD-02", "DDD-03", "DDD-04", "DDD-05", "DDD-06", "DDD-07", "DDD-08", "DDD-09", "DDD-10", "DDD-11",
  "APP-01", "APP-02", "APP-03", "APP-04", "APP-05", "PERF-01",
];

export interface IdCase {
  id: string;
  expected: boolean;
}

/** A known id, an unknown one and a known one in lower case. */
export const ID_CASES: readonly IdCase[] = [
  { id: "APP-05", expected: true },
  { id: "PERF-02", expected: false },
  { id: "ddd-01", expected: false },
];
