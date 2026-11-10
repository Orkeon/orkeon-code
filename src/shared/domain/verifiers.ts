// Verification skills — where /init-verifiers writes them and how /verify asks the
// main loop to follow them. Pure, no IO.
import {
  everyVerificationSkill, IF_THAT_FILE_IS_MISSING, IF_THERE_IS_NONE, verificationSkill, verifyRequest,
} from "./prompts.ts";

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
 * says; a failure ends in the report, never in a fix. Without a skill it says so
 * instead of improvising a check.
 */
export function buildVerifyRequest(zone: string): string {
  const z = zone.trim();
  const which = z.length > 0
    ? verificationSkill(verifierPath(z))
    : everyVerificationSkill(VERIFIERS_DIR);
  const missing = z.length > 0 ? IF_THAT_FILE_IS_MISSING : IF_THERE_IS_NONE;
  return verifyRequest(which, missing);
}
