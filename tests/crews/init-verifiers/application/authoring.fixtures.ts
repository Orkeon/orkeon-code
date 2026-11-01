// The instructions files readCommandsSection is tested over.
import { MAX_CONFIG_FILE_CHARS, cutLine } from "../../../../src/shared/domain/project-manifests.ts";

export interface CommandsFileCase {
  name: string;
  files: Record<string, string>;
  expected: { file: string; section: string } | null;
}

const SECTION = "## Commands\n\nmake check";

/** A Commands section 25 characters over the bound. */
const LONG_SECTION = `## Commands\n\n${"x".repeat(MAX_CONFIG_FILE_CHARS + 25 - 13)}`;

export const COMMANDS_FILES: readonly CommandsFileCase[] = [
  {
    name: "reads the Commands section of AGENTS.md before the one of CLAUDE.md",
    files: { "AGENTS.md": `# A\n\n${SECTION}\n`, "CLAUDE.md": "## Commands\n\nnpm test\n" },
    expected: { file: "AGENTS.md", section: SECTION },
  },
  {
    name: "reads the Commands section of CLAUDE.md when the project has no AGENTS.md",
    files: { "CLAUDE.md": `${SECTION}\n` },
    expected: { file: "CLAUDE.md", section: SECTION },
  },
  {
    name: "gives none when the instructions file read first has no Commands section",
    files: { "AGENTS.md": "# A\n\n## Rules\n", "CLAUDE.md": `${SECTION}\n` },
    expected: null,
  },
  {
    name: "reads the Commands section of CLAUDE.md when AGENTS.md is blank",
    files: { "AGENTS.md": "  \n\n", "CLAUDE.md": `${SECTION}\n` },
    expected: { file: "CLAUDE.md", section: SECTION },
  },
  {
    name: `cuts a Commands section at ${MAX_CONFIG_FILE_CHARS} characters and closes it with a cut line`,
    files: { "AGENTS.md": `${LONG_SECTION}\n` },
    expected: { file: "AGENTS.md", section: `${LONG_SECTION.slice(0, MAX_CONFIG_FILE_CHARS)}\n${cutLine(25, "this section")}` },
  },
  {
    name: "gives none when the project has no instructions file",
    files: {},
    expected: null,
  },
];
