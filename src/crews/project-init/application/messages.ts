// The text the operator reads from project-init (/init): its warnings and its outcome line.

export const CONVENTION_EXTRACT_FAILED = "convention extract failed; continuing with package.json scripts only";

/** The warning when the code index did not answer. */
export function codeIndexSilent(error: string): string {
  return `init: the code index did not answer (${error}); no package map`;
}

export const CLAUDE_MD_MERGED = "; CLAUDE.md merged and kept, the assistant now reads AGENTS.md first";

/** The outcome line of the instructions file written. */
export function wroteInstructions(path: string, bytes: number, build: string, test: string, notes: string): string {
  return `✓ wrote ${path} (${bytes} bytes; build='${build}', test='${test}')${notes}`;
}
