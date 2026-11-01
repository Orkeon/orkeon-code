// Pure project-convention helpers — no IO. The deterministic fallback was
// inlined at project-init/crew.ork.ts:62-68; extracted so it can be tested
// without an LLM run.

import type { DetectedConventions } from "../../../shared/domain/types.ts";

/** The config files /init reads, from the shared manifests module (order = read order). */
export { CONFIG_CANDIDATES } from "../../../shared/domain/project-manifests.ts";

/** The conventions /init detects: the shared ones, and how the project is started. */
export interface ProjectConventions extends DetectedConventions {
  /** How to start the project, as the configuration states it. */
  runCommand?: string;
}

/**
 * Deterministic fallback when the LLM convention-extract fails: pull npm
 * scripts + devDependencies straight from package.json. Returns empty
 * conventions if package.json is absent or unparseable. The run command stays
 * empty: a script name alone does not say how the project is started.
 */
export function fallbackConventions(packageJsonText: string): ProjectConventions {
  try {
    const pkg = JSON.parse(packageJsonText || "{}");
    // A command as it is invoked, not the script's body: `npm run build`, not `tsc -p .`.
    return {
      buildCommand: pkg.scripts?.build ? "npm run build" : undefined,
      testCommand: pkg.scripts?.test ? "npm test" : undefined,
      lintCommand: pkg.scripts?.lint ? "npm run lint" : undefined,
      frameworks: Object.keys(pkg.devDependencies ?? {}),
      conventions: [],
    };
  } catch {
    return { frameworks: [], conventions: [] };
  }
}
