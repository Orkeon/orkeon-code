// The text the operator reads from init-verifiers (/init-verifiers): its outcome lines and its warnings.

/** The outcome when every zone already has a verifier. */
export function noVerifierGaps(types: string): string {
  return `No verifier gaps detected (types: ${types}).`;
}

/** The outcome of the verifier skills written. */
export function authoredVerifiers(written: number, zones: string): string {
  return `✓ authored ${written} verifier skill(s) under /output/verifiers/ (zones: ${zones})`;
}

export const READINESS_EXTRACT_FAILED = "readiness extract failed; falling back to a package.json heuristic";
