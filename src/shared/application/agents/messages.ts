// The text the agent services report: the lines of a background child and the problems of a sub-agent's answer.

// child-agent.ts
export const CHILD_FAILED = "the child failed";
export const instancesNotWritten = (crew: string, reason: string): string =>
  `${crew}: the agent instances could not be written for /tasks: ${reason}`;
export const tasksStopLine = (crew: string, id: string, agent: string, stopRequested: boolean | undefined): string =>
  `${crew}: /tasks stop ${id} (${agent})${stopRequested ? "" : ": it was no longer running"}`;
export const startedInBackground = (agent: string, id: string, task: string): string =>
  `${agent} ${id} started in the background: ${task}`;
export const STOPPED_BY_TASKS_STOP = "stopped by /tasks stop";
export const CHILD_ENDED_WITHOUT_REPLY = "the child ended without leaving a reply";
export const waitReturnedAtOnce = (agent: string, early: number): string =>
  `the wait for ${agent} returned at once ${early} times in a row`;

// run-sub-agent.ts
export const answerDidNotParse = (reason: string): string => `the answer did not parse: ${reason}`;
export const briefTooLong = (length: number, max: number): string => `the brief is ${length} characters, over ${max}`;
