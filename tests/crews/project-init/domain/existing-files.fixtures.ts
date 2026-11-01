// The existing instruction files the /init write target is decided on.
import type { ExistingFile } from "../../../../src/crews/project-init/domain/existing-files.ts";

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
