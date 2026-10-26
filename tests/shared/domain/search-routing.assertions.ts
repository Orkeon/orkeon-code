// Checks of the search routing tests.
import { ok } from "node:assert";

/** `list` holds every one of `items`. */
export function assertHoldsEvery(list: readonly string[], items: readonly string[]): void {
  for (const item of items) ok(list.includes(item), `${item} is missing from ${JSON.stringify(list)}`);
}
