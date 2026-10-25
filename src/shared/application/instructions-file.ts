// Reading the project's instructions file — shared by the main loop (its header)
// and the crews that need the project's conventions (review, /init).

import type { Files } from "./ports.ts";
import { INSTRUCTIONS_FILES } from "../domain/instructions-file.ts";
import type { InstructionsFile } from "../domain/instructions-file.ts";
import { WORKSPACE } from "../domain/vfs.ts";

/** The project's instructions file: the first of INSTRUCTIONS_FILES present and
 *  not blank (AGENTS.md, then CLAUDE.md); undefined when the project has none. */
export async function readInstructionsFile(files: Pick<Files, "read">): Promise<InstructionsFile | undefined> {
  for (const file of INSTRUCTIONS_FILES) {
    try {
      const content = await files.read(`${WORKSPACE}/${file}`);
      if (content.trim().length > 0) return { file, content };
    } catch { /* absent or unreadable → the next one */ }
  }
  return undefined;
}
