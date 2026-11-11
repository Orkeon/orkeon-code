// The checks of the context pruning tests shared by more than one test.
import { ok } from "node:assert";

/** The state handed to the decision model holds `part`, as it is. */
export function assertStateHolds(state: string, part: string): void {
  ok(state.includes(part), `the state does not hold ${JSON.stringify(part.slice(0, 80))}:\n${state.slice(0, 600)}`);
}
