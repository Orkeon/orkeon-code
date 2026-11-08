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
