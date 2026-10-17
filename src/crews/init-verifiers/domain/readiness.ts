// Pure test-readiness helpers — no IO. The fallback heuristic + zone-name
// slug were inlined at init-verifiers/crew.ork.ts:52-75.

import type { TestReadiness } from "../../../shared/domain/types.ts";

/** Filesystem-safe slug for a verifier zone name. */
export { safeZoneName } from "../../../shared/domain/verifiers.ts";

/**
 * Deterministic fallback when readiness extraction fails: a project with a
 * package.json but no `test` script gets a single "unit-tests" zone; otherwise
 * report no gaps rather than aborting the crew.
 */
export function fallbackReadiness(packageJsonText: string): TestReadiness {
  let hasTestScript = false;
  try { hasTestScript = !!JSON.parse(packageJsonText || "{}").scripts?.test; } catch { /* ignore */ }
  const hasPkg = packageJsonText.length > 0;
  return {
    appTypes: hasPkg ? ["library"] : [],
    frameworks: [],
    zonesNeedingVerifier: hasPkg && !hasTestScript ? ["unit-tests"] : [],
  };
}
