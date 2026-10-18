// Verification skills — where /init-verifiers writes them and how /verify asks the
// main loop to follow them. Pure, no IO.

/** Where /init-verifiers writes one skill per zone, and where /verify reads them. */
export const VERIFIERS_DIR = "/output/verifiers";

/** The file-name slug of a zone: `Web UI` → `web-ui`. */
export function safeZoneName(zone: string): string {
  return zone.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
}

/** The path of a zone's skill. */
export function verifierPath(zone: string): string {
  return `${VERIFIERS_DIR}/verify-${safeZoneName(zone)}.md`;
}

/**
 * The request /verify sends to the main loop: follow one zone's skill, or every
 * skill, by running it — the check the tests cannot make — and report as the skill
 * says. Without a skill it says so instead of improvising a check.
 */
export function buildVerifyRequest(zone: string): string {
  const z = zone.trim();
  const which = z.length > 0
    ? `the verification skill ${verifierPath(z)}`
    : `every verification skill under ${VERIFIERS_DIR}/, one after the other`;
  const missing = z.length > 0 ? "If that file does not exist" : "If there is none";
  return (
    `Check that the project works by running it: follow ${which}, written by /init-verifiers, step by ` +
    "step. Run each step's command, compare what you observe with the skill's Pass section, and report " +
    `as its Report section says, quoting the output of a failure. ${missing}, say so and suggest ` +
    "/init-verifiers instead of improvising a check."
  );
}
