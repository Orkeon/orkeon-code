// The text the advisor shows the user: the header line of the advice.

/** The header when an advisor model is set. */
export const secondOpinionFrom = (advisorModel: string): string => `second opinion from '${advisorModel}'`;

/** The header when no advisor model is set: the verdict is a self-review. */
export const SELF_REVIEW_HEADER = "second opinion from the SESSION's own model — no advisor.model is set, so this is a " +
  "self-review and worth much less. Set one with /advisor <model>.";
