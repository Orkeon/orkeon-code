// The text the dev services hand to the model: the refusals of a tool call (the guard, the hooks, the budget, a
// restore), the notes on the access cost an auditor reads, and the inventory of a draft brief.

// tool-call-policy.ts, tool-callbacks.ts
export const MEMORY_GUARD = "refused by the shared memory's guard";
export const MEMORY_CONTEXT =
  "The shared memory's candidates and entries are written by memory_push and /memory-admit only: do without this call.";
export const hookMountCheckDeny = (step: string, text: string): string =>
  `${step}: ${text}\nThe call did not run: a hook's command line may name no path its ` +
  "program may not write; ask the user to change the hook.";
export const hookRefusedDeny = (step: string, text: string): string =>
  `${step}: refused by ${text}\nThe call did not run: change it, or ask the user to fix the hook.`;
export const callbackFailed = (step: string, reason: string): string => `${step}: the callback failed: ${reason}`;
export const memoryGuardFailed = (reason: string): string => `the shared memory's guard failed: ${reason}`;
export const mountCheckRefusedHook = (label: string, denial: string): string =>
  `the runtime's mount check refused the command line of ${label}, which did not run: ${denial}`;
export const hookCouldNotRun = (label: string, reason: string): string => `${label} could not run: ${reason}`;

// spend.ts, wrapped-tools.ts
export const budgetSpent = (limit: number): string =>
  `budget: this batch has spent its ${limit} tool calls; end the act and say what is left`;
export const noRoleRestores = (command: string): string => `'${command}' restores: no role restores, the step did it once`;

// measure-access-cost.ts
export const toolFailedJudgeFromDiff = (tool: string, reason: string): string =>
  `${tool} failed (${reason}); judge the Cost axis from the diff`;
export const reindexErrorJudgeFromDiff = (error: string): string => `incremental_reindex: ${error}; judge the Cost axis from the diff`;
export const accessCostErrorJudgeFromDiff = (error: string): string => `access_cost: ${error}; judge the Cost axis from the diff`;
export const NO_READABLE_REPORT = "access_cost returned no readable report; judge the Cost axis from the diff";

// brief-inventory.ts
export const INDEX_FOUND_NOTHING = "(the index found nothing for this request)";
