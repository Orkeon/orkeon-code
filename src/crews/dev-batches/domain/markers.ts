// The markers of /dev-batches: the openings of a log entry's detail that the run writes and reads back (ADR 0026).

/** The detail that opens a stop because the next batch's review could not run (G1). */
export const REVIEW_NOT_RUN = "BLOCKED — review not run";

/** The detail that opens a stop at the batch's close: the batch was audited VALID, its commit is what is left. */
export const CLOSE_STOP = "BLOCKED — close:";
