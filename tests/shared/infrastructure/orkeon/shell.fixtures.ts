// The working root and the shell_command replies the createShell tests read.
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";

export const ROOT = `${WORKSPACE}/.orkeon/worktrees/prune-F2`;

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
