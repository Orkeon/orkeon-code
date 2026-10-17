// CodeReview use case — collect the diff, run three lenses in parallel
// (Promise.all — never ctx.delegate, which deadlocks Jint), and write the
// report. Dedup/rank live in shared/severity, rendering in ../domain/report.

import type { Files, Llm, Shell } from "../../../shared/application/ports.ts";
import type { Finding } from "../../../shared/domain/types.ts";
import { LENSES, FINDINGS_SCHEMA, buildLensPrompt } from "./prompts.ts";
import type { ReviewLens } from "../domain/lenses.ts";
import type { ReviewScope } from "../domain/scope.ts";

// `resolveCommitRange` moved to ../domain/scope.ts with the rest of the pure
// scope decision (B-3); re-exported so existing importers keep working.
export { resolveCommitRange, resolveReviewScope } from "../domain/scope.ts";

/** The unified diff for the scope (mode B). Validated args — see domain/scope.ts. */
export async function collectDiff(scope: ReviewScope, shell: Shell): Promise<string> {
  return (await shell.run(`git diff ${scope.diffArgs}`)).stdout;
}

/** The changed file list for the scope. */
export async function collectChangedFiles(scope: ReviewScope, shell: Shell): Promise<string[]> {
  return (await shell.run(`git diff ${scope.diffArgs} --name-only`)).stdout
    .split("\n").map((s) => s.trim()).filter(Boolean);
}

/**
 * Run one pass of the selected lenses concurrently; a lens that fails yields no
 * findings. `priorFindings` (pass ≥ 2) is what earlier passes already found;
 * `conventions` the project's instructions file, for the style lens.
 */
export async function runLenses(
  llm: Pick<Llm, "extract">,
  diffSlice: string,
  lenses: readonly ReviewLens[] = LENSES,
  pass = 1,
  priorFindings: readonly Finding[] = [],
  conventions = "",
): Promise<Array<{ lens: string; findings: Finding[] }>> {
  return await Promise.all(lenses.map((lens) =>
    llm.extract(buildLensPrompt(lens, diffSlice, pass, priorFindings, conventions), FINDINGS_SCHEMA)
      .then((r) => ({ lens: lens.key, findings: ((r as { findings?: Finding[] } | null)?.findings ?? []) }))
      .catch(() => ({ lens: lens.key, findings: [] as Finding[] })),
  ));
}

/** Persist the rendered report. */
export async function writeReport(report: string, files: Files): Promise<void> {
  await files.write("/output/code-review-report.md", report);
}
