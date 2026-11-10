// The format literals of a rendered plan that the harness and L-1 read back by pattern: the table headers and the
// test policy line of a sheet (ADR 0026). plan-render.ts is their only writer.

import { TEST_POLICY_SECTION } from "../../../shared/domain/dev/markers.ts";

/** The plan's design section, the one the questions follow. */
export const PLAN_DESIGN_SECTION = "## 3. Design";
/** The plan's open questions, found again by OPEN_QUESTIONS_HEADING. */
export const PLAN_QUESTIONS_SECTION = "## 4. Open questions";
/** The plan's summary section, found again by SUMMARY_HEADING. */
export const PLAN_SUMMARY_SECTION = "## 0. Summary";
export const SUMMARY_HEADER = "| Batch | Intent | Ids | Depends on | Reason |";
export const TRACE_HEADER = "| Id | Code owner(s) | Batch |";
export const DESIGN_HEADER = "| Ids | Owning aggregate | Invariant and what it removes | Consistency | Batch |";
export const QUESTIONS_HEADER = "| # | Severity | Question | Evidence |";
export const ANCHORS_HEADER = "| Step | Test class / fixture | Shared doubles and builders | Production filled or created |";
export const testPolicyBlock = (fast: string, integration: string, notRun: string): string =>
  `## ${TEST_POLICY_SECTION}\n**Fast suite**: ${fast}. **Integration**: ${integration}. **Not run**: ${notRun}.`;
