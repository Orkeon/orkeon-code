// The sheets and plans the sheet edits are tested on.

const HEADER = "| # | Assumption | To be validated by |\n|---|------------|--------------------|\n";

/** A sheet with the section created before ## Decisions, holding H1. */
export const SHEET_WITH_H1 = `# X\n\n## Assumptions\n${HEADER}| H1 | dates are UTC | the user |\n\n## Decisions\n- D1\n`;

export interface AddCase {
  name: string;
  sheet: string;
  assumptions: string[];
  expected: string;
}

export const ADD_CASES: readonly AddCase[] = [
  {
    name: "creates the section before ## Decisions",
    sheet: "# X\n\n## Decisions\n- D1\n",
    assumptions: ["dates are UTC"],
    expected: SHEET_WITH_H1,
  },
  {
    name: "appends the section at the end without ## Decisions",
    sheet: "# X\n",
    assumptions: ["a"],
    expected: `# X\n\n## Assumptions\n${HEADER}| H1 | a | the user |\n`,
  },
  { name: "changes nothing without an assumption", sheet: "# X\n", assumptions: [], expected: "# X\n" },
  {
    name: "fills the table /dev-plan rendered, numbered after its rows",
    sheet: `## Assumptions\n${HEADER}| H1 | mean is exported | its red test |\n\n## Decisions\n`,
    assumptions: ["a named export"],
    expected: `## Assumptions\n${HEADER}| H1 | mean is exported | its red test |\n| H2 | a named export | the user |\n\n## Decisions\n`,
  },
  {
    name: "fills the empty table /dev-plan rendered from H1",
    sheet: `## Assumptions\n${HEADER}`,
    assumptions: ["a"],
    expected: `## Assumptions\n${HEADER}| H1 | a | the user |\n`,
  },
  {
    name: "counts the list lines of an older sheet and puts the table after them",
    sheet: "## Assumptions\n- H1 — a — to be validated by the user\n",
    assumptions: ["a", "b"],
    expected: `## Assumptions\n- H1 — a — to be validated by the user\n\n${HEADER}| H2 | b | the user |\n`,
  },
];

/** The rows H1 and H2 then ## Decisions, as the second addition leaves them. */
export const H1_H2_ROWS = "| H1 | dates are UTC | the user |\n| H2 | ids are stable | the user |\n\n## Decisions";

/** A plan with the batch F1 open, one box ticked, then the batch F2 open. */
export const PLAN = "### Batch F1 — Demo — open\n- [ ] 1. One\n- [x] 2. Two\n### Batch F2 — Next — open\n- [ ] 1. Three\n";

export interface PlanCase {
  name: string;
  plan: string;
  batch: string;
  expected: string;
}

export const PLAN_CASES: readonly PlanCase[] = [
  {
    name: "marks the plan's batch and ticks its boxes, the next batch untouched",
    plan: PLAN,
    batch: "F1",
    expected: "### Batch F1 — Demo — done (2026-10-24)\n- [x] 1. One\n- [x] 2. Two\n### Batch F2 — Next — open\n- [ ] 1. Three\n",
  },
  { name: "leaves the plan as it is for a batch it lacks", plan: PLAN, batch: "F9", expected: PLAN },
  {
    name: "ticks a box whatever its line holds, and a nested one",
    plan: "### Batch F1 — Demo — open\n- [ ] Done line holds\n  - [ ] sub\n",
    batch: "F1",
    expected: "### Batch F1 — Demo — done (2026-10-24)\n- [x] Done line holds\n  - [x] sub\n",
  },
];
