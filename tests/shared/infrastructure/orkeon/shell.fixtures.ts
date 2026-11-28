// The working root and the shell_command replies the createShell tests read.
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";
import { PROJECT_GIT, PROJECT_WIN } from "../../../support/fixtures/host-context.ts";

export const ROOT = `${WORKSPACE}/.orkeon/worktrees/prune-F2`;

/** A command naming a file as the Windows disk spells it, and the same command for the VFS. */
export const DISK_COMMAND = `type "${PROJECT_WIN}\\src\\a.ts" > out.txt`;
export const VIRTUAL_COMMAND = `type "${WORKSPACE}/src/a.ts" > out.txt`;

/** A result holding two disk spellings of the checkout, and what the caller reads. */
export const DISK_REPLY = { stdout: `${PROJECT_WIN}\\src\\a.ts: modified\n`, stderr: `warning: ${PROJECT_GIT}/x.ts\n`, exit_code: 1 };
export const VIRTUAL_RESULT = { stdout: `${WORKSPACE}/src/a.ts: modified\n`, stderr: `warning: ${WORKSPACE}/x.ts\n`, exitCode: 1 };

/** A result naming a file of the worktree ROOT as the disk spells it. */
export const ROOTED_DISK_REPLY = { stdout: `${PROJECT_WIN}\\.orkeon\\worktrees\\prune-F2\\src\\a.ts: modified`, stderr: "", exit_code: 0 };

/** Timeouts that are not a whole number of seconds, at least 1. */
export const BAD_TIMEOUTS: readonly number[] = [0, 1.5, -1];

export interface CompletedCase {
  name: string;
  reply: unknown;
}

/** Results that ran to their end: completed true, or not reported. */
export const COMPLETED_REPLIES: readonly CompletedCase[] = [
  { name: "adds no timedOut key when completed is true", reply: { stdout: "", exit_code: 0, completed: true } },
  { name: "adds no timedOut key when completed is absent", reply: { stdout: "", exit_code: 0 } },
];

/** The marker shell_command puts between the head and the tail of a stream it cut. */
export const MARKER = "\n\n[... truncated, 1234 chars omitted; output_path holds the whole output. Use more specific parameters to narrow results.]\n\n";

export interface CutCase {
  name: string;
  reply: unknown;
  /** The fields of the result the caller reads beyond stdout, stderr and exitCode. */
  expected: Record<string, unknown>;
}

/** Results whose fields say a stream was cut, in each casing, with and without a kept output. */
export const CUT_REPLIES: readonly CutCase[] = [
  {
    name: "reads a cut stdout, its true length and its output file from a snake_case result",
    reply: { stdout: `head${MARKER}tail`, exit_code: 0, stdout_truncated: true, stdout_total_chars: 1242, output_path: "/output/jobs/a1.log" },
    expected: { stdoutCut: { totalChars: 1242, outputPath: "/output/jobs/a1.log" } },
  },
  {
    name: "reads a cut stderr from a PascalCase result",
    reply: { Stderr: `head${MARKER}tail`, ExitCode: 1, StderrTruncated: true, StderrTotalChars: 1242, OutputPath: "/output/jobs/b2.log" },
    expected: { stderrCut: { totalChars: 1242, outputPath: "/output/jobs/b2.log" } },
  },
  {
    name: "names no output file when the runtime kept none",
    reply: { stdout: `head${MARKER}tail`, exit_code: 0, stdout_truncated: true, stdout_total_chars: 1242, output_path: "" },
    expected: { stdoutCut: { totalChars: 1242 } },
  },
];

/** A whole result whose stdout holds the marker's words, as a diff of the marker's own code does. */
export const WHOLE_REPLY_WITH_MARKER_WORDS = {
  stdout: `+const m = "${MARKER}";`, stderr: "", exit_code: 0, stdout_truncated: false, stdout_total_chars: 140, output_path: "",
};
