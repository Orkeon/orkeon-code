// Checks on what parseProposalsFile returns.
import { strictEqual } from "node:assert";
import type { parseProposalsFile } from "./learn-proposals.ts";

/** `r` is a refusal whose problem is one line: `not JSON (…)`. */
export function assertNotJsonProblem(r: ReturnType<typeof parseProposalsFile>): void {
  strictEqual(r.ok, false, "invalid JSON was read as a file");
  if (!r.ok) strictEqual(/^not JSON \([^\n]+\)$/.test(r.problem), true, r.problem);
}
