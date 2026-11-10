// Why no state file of the batch in progress was written, and what the tree's status could not say.

export const noWorkCode = (code: string, folder: string, reason: string): string => `no work code '${code}' in ${folder}/ (${reason})`;
export const noSheetOf = (phase: string, shown: string): string => `no sheet of ${phase} in ${shown}/`;
export const noOpenSheetOf = (phase: string, folder: string): string => `no open sheet of ${phase} in ${folder}/`;
export const gitStatusFailed = (reason: string): string => `git status failed: ${reason}`;
export const gitStatusCouldNotRun = (reason: string): string => `git status could not run: ${reason}`;
export const workFolderUnreachable = (folder: string): string => `the work folder ${folder}/ cannot be reached`;
