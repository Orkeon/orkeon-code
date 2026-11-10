// The prompts of /dev-batches' application: the goals of its agents and the title of the review material that
// shows the reviewer what a merged batch changed (ADR 0026).

export const DEV_BATCHES_GOAL = "Run a plan's batches in the order their dependencies allow, and close the plan with one pull request";
export const batchAgentGoal = (batch: string, code: string): string =>
  `Run batch ${batch} of ${code} test-first under its worktree, audit it and commit it there`;
export const GIT_TOP_PROBE_GOAL = "Say git's top under the worktree";

/** The title of a merged batch's diff in the review material; `short` is its hash cut to 7 characters. */
export const changedTitle = (batch: string, short: string): string => `what ${batch} changed (git show ${short})`;
