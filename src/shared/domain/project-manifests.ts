// The project manifests: the configuration files that state a project's commands and rules (build, test,
// lint, format, task runners, contribution guide), which /init and /init-verifiers read. Pure, no IO: the
// reads live in ../application/project-manifests.ts.
//
// Order rule: the material is bounded, so the files that state commands come first (the manifests with
// scripts or targets, then the CI workflows), the files that state rules after (lint and format
// configurations, `.editorconfig`), `CONTRIBUTING.md` last.
//
// An entry starting with `*` (`*.csproj`) names no file: it matches the top-level entries ending with the
// rest (`App.csproj`), which only a listing of the workspace root shows, since Files.read takes a path.
import { cutNotShown, filesLeftOut } from "./prompts.ts";

/**
 * The manifests that state commands (scripts, targets, tasks), relative to the workspace root, in read
 * order: the most useful first, since the material is bounded (MAX_MANIFESTS_MATERIAL_CHARS) and what does
 * not fit is left out from the end. The task runners and the build manifests of each ecosystem: Node,
 * Python, make, just, Task, Rust, Go, then the JVM and .NET.
 */
export const COMMAND_MANIFESTS: readonly string[] = [
  "package.json",
  "pyproject.toml",
  "Makefile",
  "justfile",
  "Taskfile.yml",
  "Cargo.toml",
  "go.mod",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "*.sln",
  "*.csproj",
];

/** The configurations that state rules rather than commands, read after the CI workflows: the compiler,
 *  lint and format configurations, then `.editorconfig`, the contribution guide last. */
export const RULE_CONFIGS: readonly string[] = [
  "tsconfig.json",
  ".eslintrc.json",
  ".eslintrc.js",
  "eslint.config.js",
  "eslint.config.mjs",
  "biome.json",
  "ruff.toml",
  ".editorconfig",
  "CONTRIBUTING.md",
];

/** Every manifest read, in read order: COMMAND_MANIFESTS, then RULE_CONFIGS (the CI workflows go between). */
export const CONFIG_CANDIDATES: readonly string[] = [...COMMAND_MANIFESTS, ...RULE_CONFIGS];

/** Characters read of each manifest. */
export const MAX_CONFIG_FILE_CHARS = 4_000;

/** Characters of the manifests material as a whole: whole files are kept in read order while they fit. */
export const MAX_MANIFESTS_MATERIAL_CHARS = 24_000;

/** The line that closes the visible part of a manifest (or a section) cut at its bound. */
export function cutLine(omitted: number, what = "this file"): string {
  return cutNotShown(omitted, what);
}

/** The line that ends the manifests material when files were left out of it, naming them. */
export function leftOutLine(paths: readonly string[], max = MAX_MANIFESTS_MATERIAL_CHARS): string {
  return filesLeftOut(paths.length, max, paths.join(", "));
}

/** The folder of the CI workflows, relative to the workspace root. */
export const CI_WORKFLOWS_DIR = ".github/workflows";

/** A candidate matched by suffix against the top-level entries rather than read by name. */
export function isSuffixCandidate(candidate: string): boolean {
  return candidate.startsWith("*");
}

/** The paths to read for `candidates`: a named one as it is, a suffix one replaced by the `topLevel`
 *  entries it matches, in their listing order; each path once. */
export function expandCandidates(candidates: readonly string[], topLevel: readonly string[]): string[] {
  const paths: string[] = [];
  for (const c of candidates) {
    const matches = isSuffixCandidate(c) ? topLevel.filter((name) => name.endsWith(c.slice(1))) : [c];
    for (const path of matches) if (!paths.includes(path)) paths.push(path);
  }
  return paths;
}
