// The text of the state file a batch in progress leaves before a compaction, read by the model after it.

export const stateFileTitle = (phase: string, code: string, at: string, trigger: string): string =>
  `# State of batch ${phase} of ${code} — written at ${at} before a ${trigger} compaction`;
export const readThisFirst = (sheet: string): string =>
  `> Read this file first after a compaction. The sheet is \`${sheet}\`: resume at its first open step, and`;
export const TICK_NOTHING_UNOBSERVED = "> tick nothing that was not observed. A report listed below came back already: do not ask for it again.";
export const REWRITTEN_AT_EVERY_COMPACTION = "> Rewritten at every compaction; Orkeon Code never commits it.";
export const STEPS_HEADING = "## Steps of the sheet (TDD lines)";
export const NO_STEP_WITH_TDD = "(the sheet has no step with a TDD line)";
export const NO_OPEN_STEP = "No open step: every TDD line is ticked.";
export const eventsHeading = (phase: string, path: string): string => `## Events of ${phase} in \`${path}\``;
export const earlierLinesLeftOut = (n: number): string => `(${n} earlier line(s) left out)`;
export const reportsHeading = (phase: string): string => `## Reports recorded for ${phase}`;
export const WORKING_TREE_HEADING = "## Working tree (`git status --short`)";
