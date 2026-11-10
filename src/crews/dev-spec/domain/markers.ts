// The markers of a spec file: the headings and table headers the renderer writes and /dev-plan, the review and the
// question round read back by their number (ADR 0026).

export const SPEC_DECISIONS_SECTION = "## 13. Decisions";
export const SPEC_QUESTIONS_SECTION = "## 12. Open questions";

/** The template's sections, numbered as /dev-plan expects them. */
export const SPEC_SECTIONS = {
  context: "## 1. Context",
  vocabulary: "## 2. Vocabulary",
  overview: "## 3. Overview",
  useCases: "## 4. Use cases",
  rules: "## 5. Business rules",
  data: "## 6. Data",
  states: "## 7. States and transitions",
  crossCutting: "## 8. Cross-cutting behaviours",
  relations: "## 9. Relations",
  outOfScope: "## 10. Out of scope",
  assumptions: "## 11. Assumptions",
} as const;

/** The column headers of the template's tables. */
export const SPEC_COLUMNS = {
  vocabulary: ["Term", "Definition"],
  data: ["Datum", "Description", "Source", "Importance"],
  states: ["State", "Event", "Next state", "Condition"],
  relations: ["Upstream", "Downstream"],
  outOfScope: ["Exclusion", "Reason"],
  assumptions: ["#", "Assumption", "To be validated by"],
} as const;
