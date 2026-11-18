// The values the learner's prompt shows and its answer check reads: where an owner that is not a file of the checkout
// may live. Orkeon Code's own files are listed one by one, a harness owner is a rule of a repository pack.

/** The files of Orkeon Code a motif may name, paths in the orkeon-code repository: the behaviour of each crew's prompt
 *  (changed first, ADR 0003), the design rules a plan classifies, the gate's mechanical checks, then the charters of
 *  the auditor and of the reviewer. Each one is a file of this repository (tests/repository/learn-destinations). */
export const ORKEON_CODE_DESTINATIONS: readonly string[] = [
  "docs/crew-prompts.md",
  "src/shared/domain/dev/design-rules.ts",
  "src/crews/dev-verify/domain/gate.ts",
  "src/crews/dev-verify/domain/auditor-charter.ts",
  "src/shared/domain/dev/reviewer-charter.ts",
];

/** The start of every harness owner's path: a repository pack, in the orkeon-workshop repository. */
export const HARNESS_REPO_PACKS = ".devcontainer/harness/packs/repo-";

/** Where a harness owner may live, in the orkeon-workshop repository: a rule of a repository pack. */
export const HARNESS_DESTINATIONS: readonly string[] = [`${HARNESS_REPO_PACKS}<name>/claude/rules/<file>`];
