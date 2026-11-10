// A motif's owner file as code reads it: the lines its key term finds and the removed
// lines the file does not hold, turned into the summary written to the proposal and,
// when the answer cannot stand as it is, the problems and owner lines a re-ask shows.
// The learner sees the owner files by path only, so these lines are the first it sees
// of their content. Pure, no IO: the file is read by the use case.
import { foldText } from "../../../shared/domain/shared-memory/verdict-rows.ts";
import type { AnswerMotif } from "./learn-answer.ts";
import {
  OWNER_MAY_SAY_IT, keyTermFindsNoLine, keyTermFound, keyTermNotFound, keyTermOnLines, nearestLine, removedNotFound,
  removedNotFoundIn,
} from "./messages.ts";

export const MAX_OWNER_LINES_PER_MOTIF = 8;
export const MAX_OWNER_LINE_CHARS = 160;
const REMOVED_SHOWN = 60;

export interface OwnerHit { n: number; line: string }
/** hits: the lines holding the key term (1-based numbers); missing: the removed lines, trimmed, the file lacks. */
export interface OwnerMatch { hits: OwnerHit[]; missing: string[] }
/** The owner lines shown under the problems of a re-ask, each `<path>:<n>: <line>`; label: the motif as the
 *  problems name it. */
export interface OwnerLinesBlock { label: string; path: string; lines: string[] }
export interface OwnerReview { summary: string; problems: string[]; block: OwnerLinesBlock | null }
export type ReviewedMotif = Pick<AnswerMotif, "title" | "keyTerm" | "status" | "linesRemoved">;

const cut = (text: string, n: number): string => {
  const chars = Array.from(text);
  return chars.length <= n ? text : chars.slice(0, n - 1).join("") + "…";
};

const words = (text: string): Set<string> => new Set(foldText(text).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3));

export function matchOwner(text: string, keyTerm: string, removed: readonly string[]): OwnerMatch {
  const lines = text.split(/\r?\n/);
  const term = foldText(keyTerm);
  const hits = lines.flatMap((line, i) => (foldText(line).includes(term) ? [{ n: i + 1, line }] : []));
  const present = new Set(lines.map((l) => l.trim()));
  const missing = removed.map((l) => l.trim()).filter((l) => !present.has(l));
  return { hits, missing };
}

const shownLine = (path: string, hit: OwnerHit): string => `${path}:${hit.n}: ${cut(hit.line.trim(), MAX_OWNER_LINE_CHARS)}`;

/** The hit sharing the most words with `line`, the first on a tie. */
function nearest(hits: readonly OwnerHit[], line: string): OwnerHit {
  const wanted = words(line);
  let best = hits[0];
  let bestScore = -1;
  for (const hit of hits) {
    const score = [...words(hit.line)].filter((w) => wanted.has(w)).length;
    if (score > bestScore) {
      best = hit;
      bestScore = score;
    }
  }
  return best;
}

/** What code found in the owner, as the proposal records it. */
export function ownerSummary(motif: ReviewedMotif, path: string, match: OwnerMatch): string {
  const { hits } = match;
  let out = hits.length === 0
    ? keyTermNotFound(motif.keyTerm, path)
    : keyTermFound(motif.keyTerm, hits.length, path, hits[0].n);
  if (motif.status === "new" && hits.length > 0) out += OWNER_MAY_SAY_IT;
  for (const removed of match.missing) out += removedNotFound(cut(removed, REMOVED_SHOWN));
  return out;
}

/** label: the motif as the problems name it (motifLabel). A new motif whose key term is in the owner, and a removed
 *  line the owner lacks, are problems; the owner lines go with them, and with a motif whose status copies an owner
 *  line, when the key term found any. path: the owner as the model names it, never the deployed copy read. */
export function reviewOwner(label: string, motif: ReviewedMotif, path: string, match: OwnerMatch): OwnerReview {
  const { hits, missing } = match;
  const problems: string[] = [];
  if (motif.status === "new" && hits.length > 0) {
    problems.push(keyTermOnLines(label, motif.keyTerm, hits.length, path));
  }
  for (const line of missing) {
    const where = hits.length > 0
      ? nearestLine(shownLine(path, nearest(hits, line)))
      : keyTermFindsNoLine(motif.keyTerm);
    problems.push(removedNotFoundIn(label, path, cut(line, REMOVED_SHOWN), where));
  }
  const block = (problems.length > 0 || motif.status !== "new") && hits.length > 0
    ? { label, path, lines: hits.slice(0, MAX_OWNER_LINES_PER_MOTIF).map((h) => shownLine(path, h)) }
    : null;
  return { summary: ownerSummary(motif, path, match), problems, block };
}
