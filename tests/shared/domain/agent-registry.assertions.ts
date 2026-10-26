// Checks of the agent-registry tests.
import { ok } from "node:assert";

/** The detail of every row mentions `part`. */
export function assertEveryDetailMentions(rows: readonly { readonly detail: string }[], part: string): void {
  for (const r of rows) ok(r.detail.includes(part), `a row's detail does not mention ${JSON.stringify(part)}: ${r.detail}`);
}
