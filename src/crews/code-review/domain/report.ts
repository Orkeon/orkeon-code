// Pure report rendering — no IO. Extracted from code-review/crew.ork.ts:80-91
// so the report shape can be snapshot-tested without a live LLM run.

import type { Finding } from "../../../shared/domain/types.ts";

/**
 * Render the ranked findings as the code-review-report.md body.
 *
 * `scope` is a human-readable description of what was reviewed — since B-3 that
 * may be a range ("staged changes") or a range restricted to named paths, so the
 * header no longer says "Range" about something that is not one.
 */
export function renderReport(
  scope: string,
  fileCount: number,
  findings: Finding[],
  plan?: string,
): string {
  const lines: string[] = [
    `# Code Review Report`,
    ``,
    `- Scope: \`${scope}\``,
    `- Files: ${fileCount}`,
    // B-9: the plan line makes /passes and review.lenses observable in the
    // artefact. Without it, a 3-pass review and a 1-pass review are told apart
    // only by the bill.
    ...(plan ? [`- Review: ${plan}`] : []),
    `- Findings: ${findings.length}`,
    ``,
  ];
  if (findings.length === 0) {
    lines.push("No issues found. ✅");
  } else {
    for (const f of findings) {
      lines.push(`### [${String(f.severity ?? "?").toUpperCase()}] ${f.file}:${f.line ?? "?"} — ${f.category ?? f.lens}`);
      lines.push(f.finding ?? "");
      if (f.suggestion) lines.push(``, `**Suggestion:** ${f.suggestion}`);
      lines.push(``);
    }
  }
  return lines.join("\n");
}
