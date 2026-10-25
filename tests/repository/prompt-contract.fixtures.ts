// What the prompt contract checks the catalogue against: the provenance markers and the digits the header may hold.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const markerFile = JSON.parse(readFileSync(fileURLToPath(new URL("../../scripts/provenance-markers.json", import.meta.url)), "utf8"));
/** The markers every scanned file avoids, then those only a rendered prompt must avoid (the host vocabulary of another harness). */
export const MARKERS: RegExp[] = [...markerFile.markers, ...(markerFile.promptMarkers ?? [])]
  .map((m: { source: string; flags: string }) => new RegExp(m.source, m.flags));

/** The scope identifiers the search playbook must name (`dependency_graph`'s values). */
export const IDENTIFIERS_WITH_DIGITS = /L[123]_(Package|Module|Symbol)/g;

/** The fewest system messages the catalogue renders where a prompt is a pair. */
export const MIN_SYSTEM_MESSAGES = 10;
