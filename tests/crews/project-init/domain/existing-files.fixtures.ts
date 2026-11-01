// The existing instruction files the /init write target is decided on.
import type { ExistingFile } from "../../../../src/crews/project-init/domain/existing-files.ts";
import { MAX_EXISTING_FILE_CHARS, MAX_EXISTING_FILES_CHARS } from "../../../../src/crews/project-init/domain/existing-files.ts";
import type { InstructionsFile } from "../../../../src/shared/domain/instructions-file.ts";

/** Which file /init writes, per set of existing files. */
export const TARGETS: Array<{ name: string; existing: ExistingFile[]; expected: string }> = [
  { name: "writes AGENTS.md when no existing file is there", existing: [], expected: "AGENTS.md" },
  { name: "writes AGENTS.md when every existing file was shown whole", existing: [{ file: "CLAUDE.md", content: "x" }], expected: "AGENTS.md" },
  {
    name: "writes AGENTS.proposed.md when an existing file was cut",
    existing: [{ file: "CLAUDE.md", content: "x" }, { file: "AGENTS.md", content: "y", cut: 12 }],
    expected: "AGENTS.proposed.md",
  },
];

/** What is left of MAX_EXISTING_FILES_CHARS once the first three files of filesOverTheTotal are in. */
export const LEFT_FOR_THE_LAST = 10_000;

/** Four files whose sum passes MAX_EXISTING_FILES_CHARS: two at the bound of a file, a third under it that leaves
 *  LEFT_FOR_THE_LAST of the total, and a last one 5 000 characters longer than that. */
export function filesOverTheTotal(): InstructionsFile[] {
  return [
    { file: "AGENTS.md", content: "a".repeat(MAX_EXISTING_FILE_CHARS) },
    { file: "CLAUDE.md", content: "c".repeat(MAX_EXISTING_FILE_CHARS) },
    { file: ".cursorrules", content: "r".repeat(MAX_EXISTING_FILES_CHARS - 2 * MAX_EXISTING_FILE_CHARS - LEFT_FOR_THE_LAST) },
    { file: ".github/copilot-instructions.md", content: "p".repeat(LEFT_FOR_THE_LAST + 5_000) },
  ];
}
