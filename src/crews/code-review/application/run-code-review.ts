// CodeReview use case (/review [--lens], /security-review): resolve the scope
// and the review plan, run the lens passes, rank the findings and write the
// report. The steps live in ./review, the decisions in ../domain.

import type { Files, Llm, Logger, Progress, SessionStore, Shell } from "../../../shared/application/ports.ts";
import type { ConfigStore } from "../../../shared/application/config-store.ts";
import { dedupAndRank } from "../../../shared/domain/severity.ts";
import { resolvePasses } from "../../../shared/domain/agent-policy/behavior-flags.ts";
import { PASSES_STATE_KEY } from "../../../shared/domain/session-keys.ts";
import type { Finding } from "../../../shared/domain/types.ts";
import { renderReport } from "../domain/report.ts";
import { resolveReviewScope } from "../domain/scope.ts";
import { resolveLensSelection, describeReviewPlan } from "../domain/lenses.ts";
import { collectDiff, collectChangedFiles, runLenses, writeReport } from "./review.ts";
import { cutDiff } from "./prompts.ts";
import { readInstructionsFile } from "../../../shared/application/instructions-file.ts";

/** The diff the lenses read, in characters: about 3 000 tokens, so three lenses per
 *  pass stay cheap; a longer diff is cut and says so. */
export const MAX_REVIEW_DIFF_CHARS = 12_000;

/** Status-line headline of the /review progress. */
export const REVIEW_PROGRESS_LABEL = "Reviewing changes";

/** The crew's input: `files` and `commit` scope the diff, `lenses` narrows the review. */
export interface CodeReviewInputs {
  files?: unknown;
  commit?: unknown;
  lenses?: unknown;
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
  for (const r of scope.rejected) log.warn(`review input refused: '${r.value}' — ${r.reason}`);
  log.info(`reviewing ${scope.describe}`);

  const diff = await collectDiff(scope, shell);
  if (diff.trim().length === 0) {
    const what = scope.paths.length > 0
      ? `No changes to review in the named path(s): ${scope.paths.join(", ")}.`
      : "No changes to review (empty diff).";
    return what;
  }
  const changed = await collectChangedFiles(scope, shell);

  // B-9: two settings that existed and were read by nothing until now —
  // `/passes` (session bag) and `review.lenses` (the /config key space, whose
  // spec has named this crew as its consumer since B-6).
  const [storedPasses, lensSetting] = await Promise.all([
    session.readState(PASSES_STATE_KEY).catch(() => null),
    config.readValue("review.lenses").then((r) => r.value).catch(() => undefined),
  ]);
  const passes = resolvePasses(storedPasses);
  // A crew INPUT narrows the lenses for this run (/review --lens,
  // /security-review) and beats the standing `review.lenses` setting.
  const selection = resolveLensSelection({ input: input.lenses, config: lensSetting });
  for (const u of selection.unknown) {
    log.warn(`unknown review lens '${u}' ignored (valid: correctness, security, style)`);
  }
  const plan = describeReviewPlan(selection.lenses, passes, selection.source);
  log.info(`review plan — ${plan}`);

  const diffSlice = cutDiff(diff, MAX_REVIEW_DIFF_CHARS);
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
        message: `pass ${pass} — ${selection.lenses.map((l) => l.key).join("/")}`,
      });
      const prior = dedupAndRank(results);
      const round = await runLenses(llm, diffSlice, selection.lenses, pass, prior, conventions);
      const added = round.reduce((n, r) => n + r.findings.length, 0);
      if (passes > 1) log.info(`review pass ${pass}/${passes}: ${added} raw finding(s)`);
      results.push(...round);
    }
  } finally {
    await progress.done(REVIEW_PROGRESS_LABEL);
  }
  const findings = dedupAndRank(results);

  const report = renderReport(scope.describe, changed.length, findings, plan);
  await writeReport(report, files);
  return `/output/code-review-report.md (${findings.length} findings across ${changed.length} files, ${plan})`;
}
