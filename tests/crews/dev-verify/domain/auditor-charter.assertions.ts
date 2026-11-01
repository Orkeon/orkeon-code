// Checks on the auditor's charter the auditor-charter tests share.
import { ok } from "node:assert";

/** Asserts that the charter's catalogue offers each tool of `tools`, naming the ones it leaves out. */
export function assertOffers(catalogue: readonly string[], tools: readonly string[]): void {
  const missing = tools.filter((tool) => !catalogue.includes(tool));
  ok(missing.length === 0, `the catalogue does not offer ${missing.join(", ")}`);
}
