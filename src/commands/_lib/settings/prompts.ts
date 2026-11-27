// The text the settings commands send the host's decision model.

// /route: the test question a bare /route asks, to know that the decision model answers.
/** What the question is asked about. */
export const DECISION_PROBE_STATE = "ready";
/** What a yes means; the answer itself is not read, only that one came back. */
export const DECISION_PROBE_YES = "The text is the single word 'ready'";
