// Pure project-convention helpers — no IO. The deterministic fallback was
// inlined at project-init/crew.ork.ts:62-68; extracted so it can be tested
// without an LLM run.

import type { DetectedConventions } from "../../../shared/domain/types.ts";

/** Config files we recognise when onboarding a repo (order = read order). */
export const CONFIG_CANDIDATES = [
  "package.json",
  "tsconfig.json",
  "pyproject.toml",
  "go.mod",
  "Cargo.toml",
  "Makefile",
] as const;

/**
 * Deterministic fallback when the LLM convention-extract fails: pull npm
 * scripts + devDependencies straight from package.json. Returns empty
 * conventions if package.json is absent or unparseable.
 */
export function fallbackConventions(packageJsonText: string): DetectedConventions {
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
