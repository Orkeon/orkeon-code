// The calls the createProgress tests make on a Progress: a report and the release of a slot.
import type { createProgress } from "./progress.ts";

type Progress = ReturnType<typeof createProgress>;

export interface ProgressCall {
  /** The call, as the test name says it. */
  name: string;
  call: (progress: Progress) => Promise<void>;
}

export const PROGRESS_CALLS: readonly ProgressCall[] = [
  { name: "a report", call: (progress) => progress.report({ label: "x" }) },
  { name: "a done", call: (progress) => progress.done("x") },
];
