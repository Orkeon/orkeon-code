// Checks on the inventory buildInventory answers.
import { ok } from "node:assert";

import type { InventoryEntry } from "../../../../src/crews/dev-plan/domain/inventory-model.ts";

/** `warnings` holds `warning`, word for word. */
export function assertWarns(warnings: readonly string[], warning: string): void {
  ok(warnings.includes(warning), `no warning "${warning}" among ${JSON.stringify(warnings)}`);
}

/** Every id of `ids` is among the ids of at least one entry. */
export function assertEveryIdHasEntry(entries: readonly InventoryEntry[], ids: readonly string[]): void {
  for (const id of ids) ok(entries.some((e) => e.forIds.includes(id)), `${id} has an entry`);
}
