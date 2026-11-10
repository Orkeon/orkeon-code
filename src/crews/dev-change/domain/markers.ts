// The markers of a change brief: the headings and table headers the renderer writes and the run, /dev-plan, the
// review and the question round read back (ADR 0026).

export const CHANGE_QUESTIONS_SECTION = "## 8. Open questions";
export const CHANGE_DECISIONS_SECTION = "## 9. Decisions";
export const ORIGIN_HEADING = /^## 1\. Origin\s*$/;
export const EVIDENCE_HEADING = /^## 2\. Evidence\s*$/;

/** The template's sections, numbered as /dev-plan expects them. */
export const CHANGE_SECTIONS = {
  origin: "## 1. Origin",
  evidence: "## 2. Evidence",
  acceptance: "## 3. Acceptance",
  mustNotChange: "## 4. What must not change",
  scope: "## 5. Scope",
  constraints: "## 6. Constraints",
  assumptions: "## 7. Assumptions",
} as const;

/** The column headers of the template's tables. */
export const CHANGE_COLUMNS = {
  mustNotChange: ["Behaviour", "Pinned by"],
  scope: ["In", "Out"],
  assumptions: ["#", "Assumption", "To be validated by"],
} as const;

/** The model's own cause in § 2, which a revision drops from the facts it carries over. */
export const SUSPECTED_CAUSE = "- **Suspected cause**";
