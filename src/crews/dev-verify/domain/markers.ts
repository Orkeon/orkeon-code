// The values dev-verify's writers and readers share: the check names of the mechanical table, which the verdict and
// the capture look rows up by.

export const CHECK_BUILD = "capture `build`";
export const CHECK_TRAITS = "ids carried by traits";
export const CHECK_METHODS = "step-table methods in the test roots";
export const CHECK_TEST_RUN = "last test run";
export const CHECK_SCOPE = "changed files in the batch";
export const CHECK_COST = "capture `cost`";
export const CHECK_CONVENTIONS = "layer rules of the changed layers";
export const CHECK_TICKED = "`TDD:` lines ticked";
export const CHECK_DESIGN_IDS = "design ids classified";
export const CHECK_APPLIED = "`Applied rules` ids are design-rule ids";

/** The header of the verdict table, which the verdict parsers read back. */
export const VERDICT_TABLE_HEADER = "| Severity | Axis | Gap | Evidence | Expected fix |";
