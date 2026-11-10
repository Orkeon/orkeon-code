// The text /analyze shows the user: its progress phases, its warnings and its early answer.

/** Status-line headline of the /analyze progress. */
export const PROGRESS_LABEL = "Analyzing codebase";

/** The progress phases, in order. */
export const PHASE_INDEXING = "indexing";
export const PHASE_MAPPING = "mapping the codebase";
export const PHASE_WALKING = "walking module dependencies";
export const PHASE_SUMMARIZING = "summarizing packages";
export const PHASE_SYNTHESIZING = "synthesizing";

export const parallelIgnored = (value: string): string =>
  `analyze: --parallel ${value} is not a whole number of at least 1, the runtime's default applies`;

export const nothingIndexed = (workspace: string): string =>
  `analyze: indexed 0 file(s) under ${workspace} — nothing to analyze ` +
  "(no file matches the Tree-sitter adapters' extensions).";

export const indexed = (files: number, nodes: number, note: string): string =>
  `analyze: indexed ${files} file(s), ${nodes} node(s)${note === "" ? "" : `; ${note}`}`;

export const packagesNotRead = (beyond: number, cap: number): string =>
  `analyze: ${beyond} package(s) beyond the cap of ${cap} not read`;

export const packagesNotSummarized = (beyond: number, cap: number): string =>
  `analyze: ${beyond} package(s) beyond the cap of ${cap} not summarized`;
