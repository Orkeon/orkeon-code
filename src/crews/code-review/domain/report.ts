// Pure report rendering — no IO. Extracted from code-review/crew.ork.ts:80-91
// so the report shape can be snapshot-tested without a live LLM run.

import type { Finding } from "../../../shared/domain/types.ts";
import { diffCutLine, findingsLine, NO_ISSUES, NO_ISSUES_IN_PART_REVIEWED, REPORT_TITLE } from "./messages.ts";

/** How much of the diff the lenses read: `shown` characters, `leftOut` not reviewed. */
export interface ReportCut {
  shown: number;
  leftOut: number;
}

/**
 * Render the ranked findings as the code-review-report.md body.
 *
 * `scope` is a human-readable description of what was reviewed — since B-3 that
 * may be a range ("staged changes") or a range restricted to named paths, so the
 * header no longer says "Range" about something that is not one.
 *
 * `cut`, when the diff was cut, puts the amount not reviewed in the header, and an
 * empty review then says it covers the part reviewed only: "No issues found" on a cut
 * diff is not a clean review. `findingsLeftOut` is how many less severe findings the
 * report cap dropped.
 */
export function renderReport(
  scope: string,
  fileCount: number,
  findings: Finding[],
  plan?: string,
  cut?: ReportCut,
  findingsLeftOut = 0,
): string {
  const lines: string[] = [
    REPORT_TITLE,
    ``,
    `- Scope: \`${scope}\``,
    `- Files: ${fileCount}`,
    // B-9: the plan line makes /passes and review.lenses observable in the
    // artefact. Without it, a 3-pass review and a 1-pass review are told apart
    // only by the bill.
    ...(plan ? [`- Review: ${plan}`] : []),
    ...(cut ? [diffCutLine(cut.shown, cut.leftOut)] : []),
    findingsLine(findings.length, findingsLeftOut),
    ``,
  ];
  if (findings.length === 0) {
    lines.push(cut ? NO_ISSUES_IN_PART_REVIEWED : NO_ISSUES);
  } else {
    for (const f of findings) {
      const plausible = f.confidence === "plausible" ? " (plausible)" : "";
      lines.push(`### [${String(f.severity ?? "?").toUpperCase()}]${plausible} ${f.file}:${f.line ?? "?"} — ${f.category ?? f.lens}`);
      lines.push(f.finding ?? "");
      if (f.suggestion) lines.push(``, `**Suggestion:** ${f.suggestion}`);
      lines.push(``);
    }
  }
  return lines.join("\n");
}
