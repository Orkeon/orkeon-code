// The project's instructions file — which file the agent reads and /init writes.
// Pure, no IO.

/**
 * The instructions files of a project, in order of preference: the loop reads the
 * first one present and /init writes the first. AGENTS.md is the name several
 * assistants share; CLAUDE.md stays readable for projects that already have one.
 */
export const INSTRUCTIONS_FILES = ["AGENTS.md", "CLAUDE.md"] as const;

/** The file /init writes. */
export const INSTRUCTIONS_FILE_WRITTEN = INSTRUCTIONS_FILES[0];

/** The instructions file as the loop read it: which file, and its text. */
export interface InstructionsFile {
  file: string;
  content: string;
}
