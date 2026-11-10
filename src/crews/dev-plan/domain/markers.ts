// The format literals of a rendered plan that the harness and L-1 read back by pattern: the table headers and the
// test policy line of a sheet (ADR 0026). plan-render.ts is their only writer.

export const SUMMARY_HEADER = "| Batch | Intent | Ids | Depends on | Reason |";
export const TRACE_HEADER = "| Id | Code owner(s) | Batch |";
export const DESIGN_HEADER = "| Ids | Owning aggregate | Invariant and what it removes | Consistency | Batch |";
export const QUESTIONS_HEADER = "| # | Severity | Question | Evidence |";
export const TESTS_HEADER = "| # | Test | Level | Project | Ids |";
export const ANCHORS_HEADER = "| Step | Test class / fixture | Shared doubles and builders | Production filled or created |";
export const ASSUMPTIONS_HEADER = "| # | Assumption | To be validated by |";
export const testPolicyBlock = (fast: string, integration: string, notRun: string): string =>
  `## Test policy and scopes\n**Fast suite**: ${fast}. **Integration**: ${integration}. **Not run**: ${notRun}.`;
