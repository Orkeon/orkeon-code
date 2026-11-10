// The messages of dev-learn's domain: the problems the check of a learner's answer and the review of its owner
// report (the model reads them back on a re-ask), and the lines of PROPOSALS.md the person reads (ADR 0026).

// ── The problems of a learner's answer ──────────────────────────────────

export const addsLines = (max: number): string => `1 to ${max} lines added and at most ${max} removed`;
export const removesLines = (max: number): string => `removes takes out 1 to ${max} lines and adds none`;
/** Why a status other than new is refused on an answer given without owner lines: it copies a line it never saw. */
export const SEEN_LINES_ONLY = (status: string): string =>
  `${status} copies a line of its owner, and this answer was given without the owner lines: give status new, ` +
  "or copy the line from the owner lines when they are shown";
export const titleLength = (at: string): string => `${at}: title must be 1 to 80 characters`;
export const topicNotSlug = (at: string, topic: string, max: number): string =>
  `${at}: topic '${topic}' is not a kebab slug of at most ${max} characters`;
export const rowsEmpty = (at: string): string => `${at}: rows is empty`;
export const rowNotGiven = (at: string, id: string): string => `${at}: row '${id}' is not one of the rows given`;
export const rowTwice = (at: string, id: string): string => `${at}: row '${id}' is listed twice`;
export const ownerKindIs = (at: string): string => `${at}: owner_kind must be repository or harness`;
export const ownerPathNotRelative = (at: string, path: string): string => `${at}: owner_path '${path}' is not a relative path`;
export const deployedCopy = (at: string): string =>
  `${at}: .claude/ is the harness's deployed copy: name the orkeon-workshop file with owner_kind harness`;
export const harnessOwnerUnder = (at: string, packs: string): string =>
  `${at}: a harness owner is a file of the orkeon-workshop repository under ${packs}`;
export const checkIsOneOf = (at: string, kinds: string): string => `${at}: check must be one of ${kinds}`;
export const statusIs = (at: string): string => `${at}: status must be new, refines, replaces or removes`;
export const atProblem = (at: string, problem: string): string => `${at}: ${problem}`;
export const lineLength = (at: string): string => `${at}: each line is one line of at most 300 characters`;
export const needsRemovedLine = (at: string, status: string): string => `${at}: ${status} needs the line it removes`;
export const droppedNeeds = (k: number): string => `dropped ${k}: title, filter and reason are needed`;
export const MOTIFS_MUST_BE_LIST = "motifs must be a list";
export const tooManyMotifs = (count: number): string => `at most 3 motifs, not ${count}`;
export const sameRows = (label: string, first: number): string => `${label}: the same rows as motif ${first}: merge them into one motif`;

// ── The owner review ────────────────────────────────────────────────────

export const keyTermNotFound = (term: string, path: string): string => `'${term}' not found in ${path}`;
export const keyTermFound = (term: string, count: number, path: string, first: number): string =>
  `'${term}' on ${count} lines of ${path}, first ${path}:${first}`;
export const OWNER_MAY_SAY_IT = "; the owner may already say it";
export const removedNotFound = (line: string): string => `; removed line not found: ${line}`;
export const keyTermOnLines = (label: string, term: string, count: number, path: string): string =>
  `${label}: '${term}' is on ${count} lines of ${path}, shown below: keep status new only ` +
  "for what they miss; else refine, replace or remove one of them, or drop the motif under novelty";
export const nearestLine = (shown: string): string => `; nearest: ${shown}`;
export const keyTermFindsNoLine = (term: string): string => `; '${term}' finds no line there: give the motif status new`;
export const removedNotFoundIn = (label: string, path: string, line: string, where: string): string =>
  `${label}: removed line not found in ${path}: "${line}"${where}`;

// ── PROPOSALS.md ────────────────────────────────────────────────────────

export const NO_MOTIF_KEPT = "No motif kept.";
export const noProposal = (reason: string | undefined): string =>
  `No proposal: the answer did not parse after one re-ask (${reason ?? "no reason given"}).`;
export const unchangedSince = (since: string | undefined): string => `Unchanged since ${since ?? "an earlier run"}: not asked again.`;
export const MOTIF_TABLE_HEADER = [
  "| Id | Motif | Batches | Status | Owner | Check | Reconcile |",
  "|----|-------|---------|--------|-------|-------|-----------|",
];
export const notShown = (hidden: number, cap: number): string => `Not shown to the model: ${hidden} gaps (cap ${cap})`;
export const NOTHING_TO_DECIDE = "Nothing to decide.";
export const proposalsHead = (
  work: string, gaps: number, batches: number, files: number, orkeon: number, harness: number, refused: number,
): string =>
  `Work folder \`${work}\`: ${gaps} untreated gaps across ${batches} batches in ${files} verdict files. ` +
  `Treated before: ${orkeon} by Orkeon Code, ${harness} by the harness. Refused motifs: ${refused}.`;
