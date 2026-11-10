// CodeReview use case (/review [--lens] [--passes], /security-review): resolve the scope
// and the review plan, run the lens passes, rank the findings and write the
// report. The steps live in ./review, the decisions in ../domain.

import type { Files, Llm, Logger, Progress, SessionStore, Shell } from "../../../shared/application/ports.ts";
import type { ConfigStore } from "../../../shared/application/config-store.ts";
import { dedupAndRank } from "../../../shared/domain/severity.ts";
import { resolvePasses } from "../../../shared/domain/agent-policy/behavior-flags.ts";
import { PASSES_STATE_KEY } from "../../../shared/domain/session-keys.ts";
import type { Finding } from "../../../shared/domain/types.ts";
import { renderReport } from "../domain/report.ts";
import { resolveReviewScope, type ReviewInputs } from "../domain/scope.ts";
import { resolveLensSelection, describeReviewPlan } from "../domain/lenses.ts";
import {
  chooseReviewDiff, collectDiff, collectChangedFiles, collectFunctionContextDiff, runLenses, writeReport,
} from "./review.ts";
import { cutDiff } from "./lens-material.ts";
import { readInstructionsFile } from "../../../shared/application/instructions-file.ts";
import {
  NO_CHANGES, noChangesInPaths, passFindings, passProgress, reportWritten, REVIEW_PROGRESS_LABEL, reviewInputRefused,
  reviewing, reviewPlan, unknownLens,
} from "./messages.ts";

/** The diff the lenses read, in characters: about 3 000 tokens, so three lenses per
 *  pass stay cheap; a longer diff is cut and says so. */
export const MAX_REVIEW_DIFF_CHARS = 12_000;

/** The findings the merged report keeps, the most severe first: three lenses times
 *  several passes would otherwise reach dozens of items. */
export const MAX_REPORT_FINDINGS = 30;

/** The crew's input: `files` and `commit` scope the diff, `lenses` narrows the review, `passes` sets its rounds. */
export interface CodeReviewInputs extends ReviewInputs {
  lenses?: unknown;
  passes?: unknown;
}

/** A pass count the input names (`/review --passes`), else the session's: the input outranks the session key. */
function runPasses(input: unknown, stored: unknown): number {
  const named = input !== undefined && input !== null && String(input).trim() !== "";
  return resolvePasses(named ? input : stored);
}

export interface CodeReviewDeps {
  shell: Shell;
  files: Files;
  progress: Progress;
  session: Pick<SessionStore, "readState">;
  config: Pick<ConfigStore, "readValue">;
  llm: Pick<Llm, "extract">;
  log: Logger;
}

/** Review the scope the input names; the report's path and tally, or why there is none. */
export async function runCodeReview(input: CodeReviewInputs, deps: CodeReviewDeps): Promise<string> {
  const { shell, files, progress, session, config, llm, log } = deps;
  // B-3: `files` used to be declared in the input contract and ignored — a
  // caller asking to review two paths got whatever was staged, silently.
  const scope = resolveReviewScope(input);
  for (const r of scope.rejected) log.warn(reviewInputRefused(r.value, r.reason));
  log.info(reviewing(scope.describe));

  const diff = await collectDiff(scope, shell);
  if (diff.trim().length === 0) {
    return scope.paths.length > 0 ? noChangesInPaths(scope.paths.join(", ")) : NO_CHANGES;
  }
  // Function context only lengthens a diff: over the cap already, it is not asked for.
  const withContext = diff.length <= MAX_REVIEW_DIFF_CHARS ? await collectFunctionContextDiff(scope, shell) : "";
  const reviewed = chooseReviewDiff(diff, withContext, MAX_REVIEW_DIFF_CHARS);
  const changed = await collectChangedFiles(scope, shell);

  // B-9: two settings that existed and were read by nothing until now —
  // `/passes` (session bag) and `review.lenses` (the /config key space, whose
  // spec has named this crew as its consumer since B-6). A crew INPUT beats
  // each for this run: `/review --passes` the first, `--lens` the second.
  const [storedPasses, lensSetting] = await Promise.all([
    session.readState(PASSES_STATE_KEY).catch(() => null),
    config.readValue("review.lenses").then((r) => r.value).catch(() => undefined),
  ]);
  const passes = runPasses(input.passes, storedPasses);
  // A crew INPUT narrows the lenses for this run (/review --lens, the
  // /security-review alias) and beats the standing `review.lenses` setting.
  const selection = resolveLensSelection({ input: input.lenses, config: lensSetting });
  for (const u of selection.unknown) {
    log.warn(unknownLens(u));
  }
  const plan = describeReviewPlan(selection.lenses, passes, selection.source);
  log.info(reviewPlan(plan));

  const diffSlice = cutDiff(reviewed.diff, MAX_REVIEW_DIFF_CHARS);
  const cut = reviewed.diff.length > MAX_REVIEW_DIFF_CHARS
    ? { shown: MAX_REVIEW_DIFF_CHARS, leftOut: reviewed.diff.length - MAX_REVIEW_DIFF_CHARS }
    : undefined;
  // The style lens judges conventions: give it the ones the project states.
  const conventions = (await readInstructionsFile(files).catch(() => undefined))?.content ?? "";
  // Passes run in SEQUENCE (the lenses within a pass still fan out): pass n+1
  // is shown what the earlier ones found and asked for what they missed, which
  // only works if they have finished.
  const results: Array<{ lens: string; findings: Finding[] }> = [];
  try {
    for (let pass = 1; pass <= passes; pass++) {
      await progress.report({
        label: REVIEW_PROGRESS_LABEL, step: pass, total: passes,
        message: passProgress(pass, selection.lenses.map((l) => l.key).join("/")),
      });
      const prior = dedupAndRank(results);
      const round = await runLenses(llm, diffSlice, selection.lenses, pass, prior, conventions);
      const added = round.reduce((n, r) => n + r.findings.length, 0);
      if (passes > 1) log.info(passFindings(pass, passes, added));
      results.push(...round);
    }
  } finally {
    await progress.done(REVIEW_PROGRESS_LABEL);
  }
  const ranked = dedupAndRank(results);
  const findings = ranked.slice(0, MAX_REPORT_FINDINGS);

  const report = renderReport(scope.describe, changed.length, findings, plan, cut, ranked.length - findings.length);
  await writeReport(report, files);
  return reportWritten(findings.length, changed.length, plan);
}
