// The text the shared-memory services report: the admission, the harvests, the import, a push's refusals (the
// memory_push tool hands them to the model as they are) and the settings set aside.

// admit-entries.ts
export const candidateUnreadable = (reason: string): string => `its candidate file cannot be read (${reason})`;
export const NO_CANDIDATE_FILE = "no candidate file";
export const CANDIDATE_CHANGED = "its file changed since it was confirmed: run /memory-admit again";
export const notACandidateAnyMore = (problem: string): string => `its file is not a candidate entry any more (${problem})`;
export const statusNotCandidate = (status: string): string => `its status is ${status}, not candidate`;
export const fileHoldsId = (id: string): string => `its file holds the id ${id}`;
export const refusedFileUnreadable = (id: string, path: string, reason: string): string => `${id}: ${path} cannot be read (${reason})`;
export const topicWasRefused = (id: string, topic: string): string => `${id}: its topic '${topic}' was refused (refused.md)`;
export const supersedesNoAdmitted = (id: string, old: string): string =>
  `${id} supersedes ${old}, which is no admitted entry: left as it is`;
export const notMarkedSuperseded = (old: string, id: string, reason: string): string =>
  `${old} not marked superseded by ${id} (${reason})`;
export const refusedNotWritten = (id: string, path: string, reason: string): string =>
  `${id}: ${path} not written (${reason}), the candidate stays`;
export const stillReadsAsCandidate = (path: string, reason: string): string =>
  `${path} still reads as a candidate (${reason}): /memory-admit will say it is decided`;
export const indexStale = (collection: string, reason: string): string =>
  `the index of ${collection} is stale (${reason}): the next admission re-ingests entries/`;
export const NOTHING_TO_APPLY = "nothing to apply";

// harvest-after-gaps.ts, harvest-mistakes.ts
export const UNTREATED_GAP = "untreated verdict gap";
export const UNTREATED_GAPS = "untreated verdict gaps";
export const learnNudgeLine = (gaps: string, batches: number): string =>
  `→ ${gaps} across ${batches} batches: /dev-learn ` +
  "turns those that recur into rules (in a fresh session).";
export const harvestSkipped = (reason: string): string => `shared memory: harvest: ${reason}`;
export const mistakesHarvested = (candidates: string, ids: string): string =>
  `shared memory: ${candidates} harvested from the audits ` +
  `(${ids}) → /memory-admit decides each one.`;
export const harvestFailed = (reason: string): string => `shared memory: harvest after the verdict failed (${reason})`;
export const refusedUnreadableNothingHarvested = (reason: string): string => `refused.md cannot be read (${reason}): nothing harvested`;
export const mistakeAlreadyHeld = (topic: string): string => `${topic}: a mistake candidate or entry already holds it`;

// import-agent-memory.ts
export const cannotBeRead = (path: string, reason: string): string => `${path} cannot be read (${reason})`;
export const noteUnreadable = (path: string, reason: string): string => `${path} cannot be read (${reason}): the line alone is imported`;
export const looksLikeSecret = (patterns: string): string => `the item looks like it holds a secret (${patterns})`;
export const noAgentMemory = (root: string, index: string): string => `No harness agent memory in ${root} (no <agent>/${index}).`;
export const NO_CANDIDATE_WRITTEN = "No candidate written.";
export const duplicatesSkipped = (count: number, list: string): string =>
  `${count} duplicate(s) skipped (topic already held): ${list}`;
export const DECIDE_WITH_MEMORY_ADMIT = "Decide them with /memory-admit (each one is asked).";

// memory-files.ts, memory-settings.ts, recall-precedents.ts
export const notRefreshed = (path: string, title: string): string =>
  `${path} not refreshed: it exists and is not the memory's (it does not start with '${title}')`;
export const memoryDirSetAside = (key: string, raw: string, reason: string, dir: string): string =>
  `${key} '${raw}' set aside (${reason}): ${dir} applies`;
export const recallFailed = (reason: string): string => `shared memory: recall failed, no precedents (${reason})`;

// push-candidate.ts: the refusals of memory_push
export const typeMustBeOneOf = (types: string): string => `type must be one of ${types}`;
export const EVIDENCE_REQUIRED = "evidence required: at least one path:line, commit or verdict file";
export const evidenceNamesSecret = (paths: string): string => `evidence names a secret-like file: ${paths}`;
export const topicNeverProposedAgain = (topic: string): string =>
  `topic '${topic}' was refused (refused.md): it is never proposed again`;
export const refusedUnreadableNothingWritten = (reason: string): string => `refused.md cannot be read (${reason}): nothing was written`;
export const notAValidEntry = (problems: string): string => `not a valid entry: ${problems}`;
export const nineHoldTheId = (id: string): string => `nine candidates or entries already hold the id ${id}`;
export const admittedHoldsId = (id: string): string => `an admitted entry already holds ${id}: supersede it rather than push it again`;
export const notWritable = (path: string, reason: string): string => `${path} is not writable (${reason}): nothing was written`;
export const overwroteTwice = (id: string): string => `another push overwrote ${id} twice: nothing was kept, push again`;
