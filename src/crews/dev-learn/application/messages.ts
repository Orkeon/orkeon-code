// The messages of /dev-learn: its refusals, the lines of its listing and of its end message, the reasons of a motif
// code drops, the question of its decisions, and the words of its crew (ADR 0026).

// ── The crew ────────────────────────────────────────────────────────────

export const LEARNER_GOAL = "Turn the gaps that audits keep finding into a few preventive lines, each with its owner file.";

// ── Refusals ────────────────────────────────────────────────────────────

export const BAD_INPUT_AXIS = "dev-learn: bad input axis";
export const BAD_INPUT_LIST = "dev-learn: bad input list";
export const LEARN_NOT_IN_WORK_TREE = "dev-learn: not inside a git work tree";
export const notAtTop = (top: string, workspace: string): string =>
  `dev-learn: the git work tree is ${top}, not ${workspace}: run Orkeon Code at the top of the repository`;

// ── The head line and the listing ───────────────────────────────────────

export const learnHead = (
  label: string, gaps: number, batches: number, files: number, orkeon: number, harness: number, refused: number,
): string =>
  `dev-learn — work folder ${label} — ${gaps} untreated gaps across ` +
  `${batches} batches in ${files} verdict files (treated: ` +
  `${orkeon} by Orkeon Code, ${harness} by the harness; ` +
  `refused motifs: ${refused})`;
export const nothingUntreatedOnAxis = (axis: string): string => `dev-learn: nothing untreated on axis ${axis}`;
export const NOTHING_UNTREATED = "dev-learn: nothing untreated";
export const AXIS_TABLE_HEADER = "axis             gaps batches blocking";

// ── The model call and the filters ──────────────────────────────────────

export const REFUSED_IN_HARNESS = "refused in the harness's state";
export const REMOVED_LINE_KEPT = "its removed line is kept (harness refusal)";

// ── The end message ─────────────────────────────────────────────────────

export const axisUnchanged = (axis: string, since: string | undefined): string =>
  `axis ${axis} — unchanged since ${since ?? "an earlier run"}: no call`;
export const motifsProposed = (head: string, count: number, ids: string, dropped: number): string =>
  `${head}${count} motifs proposed (${ids}), ${dropped} dropped`;
export const noMotifKept = (head: string, dropped: number): string => `${head}no motif kept, ${dropped} dropped`;
export const decideQuestion = (axis: string, shown: string): string =>
  `dev-learn — axis ${axis}: select the motifs to accept; the others are refused. ` +
  `Decide later, or nothing selected, decides nothing (read ${shown} first)`;
export const underThreeBatches = (axis: string, batches: number): string =>
  `axis ${axis} — ${batches} batches, under the 3 a motif needs: nothing to propose`;
export const noAxisEligible = (named: string): string =>
  `dev-learn: no axis has untreated gaps in 3 batches or more (${named}): nothing written`;
export const noProposalOnAxis = (axis: string, problem: string): string => `dev-learn: axis ${axis}: no proposal (${problem})`;
export const proposalsWritten = (shown: string): string => `dev-learn: proposals written to ${shown}/`;
export const REFUSE_EACH = "  or /dev-learn --refuse <id> for each one you reject — read the lines first in PROPOSALS.md";
export const NOTHING_TO_DECIDE_UNTIL_NEW_GAPS = "→ nothing to decide: the axes return once new gaps arrive";
