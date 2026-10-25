// File names and codes the artefact helpers are tested on.
import type { ArtefactName } from "./artefacts.ts";

export interface ClassifyCase {
  name: string;
  file: string;
  expected: ArtefactName;
}

/** One file name per kind, with its prefix and, for a verdict, its batch. */
export const KIND_CASES: readonly ClassifyCase[] = [
  { name: "a spec", file: "SPEC-demo.md", expected: { kind: "spec", name: "SPEC-demo.md", prefix: "demo" } },
  { name: "a change", file: "CHANGE-fix-7.md", expected: { kind: "change", name: "CHANGE-fix-7.md", prefix: "fix-7" } },
  { name: "a plan", file: "DEMO-PLAN.md", expected: { kind: "plan", name: "DEMO-PLAN.md", prefix: "DEMO" } },
  {
    name: "a verdict, with its batch",
    file: "DEMO-VERIFY-F2.md",
    expected: { kind: "verdict", name: "DEMO-VERIFY-F2.md", prefix: "DEMO", batch: "F2" },
  },
  {
    name: "a batches-state log",
    file: "STUDIO-71-BATCHES-STATE.md",
    expected: { kind: "batches-state", name: "STUDIO-71-BATCHES-STATE.md", prefix: "STUDIO-71" },
  },
];

/** Names that are no dev artefact. */
export const OTHER_NAMES: readonly string[] = [
  "PLAN.md", "notes.md", "DEMO-PLAN.txt", "-PLAN.md", "DEMO-VERIFY-1.md", "DEMO-PLAN-Fx.md",
];

/** Plain folder names isCode accepts. */
export const PLAIN_CODES: readonly string[] = ["demo", "STUDIO-71", "a.b_c"];

/** Paths, a leading dash, a double dot, an empty name and a hidden one: isCode refuses them. */
export const REFUSED_CODES: readonly string[] = ["../x", "a/b", "-x", "a..b", "", ".hidden"];

/** Batch ids out of order: F ids by number, then the others by text. */
export const UNSORTED_IDS: readonly string[] = ["F10", "zeta", "F2", "alpha", "F1"];
export const SORTED_IDS: readonly string[] = ["F1", "F2", "F10", "alpha", "zeta"];
