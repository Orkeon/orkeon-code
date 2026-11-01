// The owner file the owner-lines review is tested on, the motifs it reviews, and one case per outcome of the review.
import type { OwnerLinesBlock, ReviewedMotif } from "../../../../src/crews/dev-learn/domain/owner-lines.ts";
import { motifLabel } from "../../../../src/crews/dev-learn/domain/learn-answer.ts";

export const PATH = "CONTRIBUTING.md";
export const LABEL = motifLabel(1, "Refusal paths go untested");

/** A guide whose key term 'refusal' is on lines 2 and 4, once with a capital and an accent folded away. */
export const OWNER_TEXT = "# Contributing\r\nA refusal is part of a command's contract.\nKeep it short.\nEvery Refusál message ends with a full stop.\n";

/** A new motif on 'refusal', its fields overridden by `over`. */
export const reviewed = (over: Partial<ReviewedMotif> = {}): ReviewedMotif => ({
  title: "Refusal paths go untested", keyTerm: "refusal", status: "new", linesRemoved: [], ...over,
});

/** The owner lines OWNER_TEXT shows for 'refusal'. */
export const REFUSAL_BLOCK: OwnerLinesBlock = {
  label: LABEL, path: PATH,
  lines: [`${PATH}:2: A refusal is part of a command's contract.`, `${PATH}:4: Every Refusál message ends with a full stop.`],
};

export interface ReviewCase {
  name: string;
  motif: ReviewedMotif;
  problems: readonly string[];
  block: OwnerLinesBlock | null;
}

/** One case per outcome of reviewOwner over OWNER_TEXT. */
export const REVIEW_CASES: readonly ReviewCase[] = [
  {
    name: "a new motif whose key term the owner holds is a problem shown with the owner lines",
    motif: reviewed(),
    problems: [`${LABEL}: 'refusal' is on 2 lines of ${PATH}, shown below: keep status new only for what they miss; ` +
      "else refine, replace or remove one of them, or drop the motif under novelty"],
    block: REFUSAL_BLOCK,
  },
  { name: "a new motif whose key term the owner lacks raises nothing", motif: reviewed({ keyTerm: "fixture" }), problems: [], block: null },
  {
    name: "a motif whose removed lines are all in the owner raises nothing",
    motif: reviewed({ status: "refines", linesRemoved: [" Keep it short. "] }), problems: [], block: null,
  },
  {
    name: "a removed line the owner lacks names the nearest line the key term finds",
    motif: reviewed({ status: "removes", linesRemoved: ["Every refusal message ends with a period."] }),
    problems: [`${LABEL}: removed line not found in ${PATH}: "Every refusal message ends with a period."; ` +
      `nearest: ${PATH}:4: Every Refusál message ends with a full stop.`],
    block: REFUSAL_BLOCK,
  },
  {
    name: "a removed line the owner lacks, with no line of the key term, asks for status new",
    motif: reviewed({ keyTerm: "fixture", status: "replaces", linesRemoved: ["A fixture is shared."] }),
    problems: [`${LABEL}: removed line not found in ${PATH}: "A fixture is shared."; 'fixture' finds no line there: ` +
      "give the motif status new"],
    block: null,
  },
];

/** An owner with twelve long lines holding 'refusal'. */
export const LONG_OWNER = Array.from({ length: 12 }, (_, i) => `refusal ${i} ${"x".repeat(200)}`).join("\n");

/** The summary of a new motif over OWNER_TEXT that also removes a line the owner lacks. */
export const SUMMARY = `'refusal' on 2 lines of ${PATH}, first ${PATH}:2; the owner may already say it; ` +
  "removed line not found: A line nobody wrote.";
