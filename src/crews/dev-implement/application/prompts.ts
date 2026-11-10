// The prompts of /dev-implement's application: the crew agent's goal and the question that asks the implementer for
// its Cost line again (ADR 0026).

export const DEV_IMPLEMENT_GOAL = "Run the steps of one batch sheet test-first: red tests by the test author, then the least code that turns them green";

/** The one-line question when the implementer's answer held no Cost line; `steps` is `Steps 1-2`, `Step 3`. */
export const askCostLine = (steps: string, code: string, batch: string | undefined): string =>
  `${steps} of ${code} ${batch}: answer with one line only, ` +
  "`Cost: <reads> reads, <writes> writes; <where a port call sits in a loop, a lambda or a memory filter, or none>`.";
