// A session buffer with two traced turns, for the /usage tools tests.
import type { SessionMsg } from "../../../../src/shared/domain/types.ts";

const HEADER = "[tools] The tool calls of the answer below (material: what was called, not what it returned):";

/** Two turns that called tools, a marked user message between them, and one that called none. */
export const TRACED_SESSION: SessionMsg[] = [
  { role: "user", content: "how many sealed classes?" },
  { role: "system", content: `${HEADER}\n- grep(path=src, output_mode=count) → 1589 matches in 1200 files` },
  { role: "assistant", content: "1589." },
  { role: "user", content: "[turn-context] Context the turn-start checks added:\nsession resumed" },
  { role: "user", content: "which file is the biggest?" },
  { role: "system", content: `${HEADER}\n- glob(pattern=**/*.cs) → 2487 files\n- file_read(path=src/A.cs) → 900 lines` },
  { role: "assistant", content: "src/A.cs." },
  { role: "user", content: "thanks" },
  { role: "assistant", content: "You are welcome." },
];

/** Every line /usage tools shows of TRACED_SESSION. */
export const ALL_TRACE_LINES: readonly string[] = [
  "> how many sealed classes?",
  "  - grep(path=src, output_mode=count) → 1589 matches in 1200 files",
  "> which file is the biggest?",
  "  - glob(pattern=**/*.cs) → 2487 files",
  "  - file_read(path=src/A.cs) → 900 lines",
];
