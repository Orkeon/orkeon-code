// Static CLI metadata shared by /status (version) and /release-notes. No IO.
//
// Orkeon Code versions independently of the Orkeon runtime it runs on: the
// runtime is pinned to a commit of Orkeon's main in .orkeon-version, this one follows
// package.json (tests/repository/version.test.ts keeps the two equal). In RELEASE_NOTES (messages.ts),
// tests/commands/_lib/status/messages.test.ts pins the command count, this version, the crew names, the Orkeon
// version of .config/dotnet-tools.json and the Headless line; the rest of the notes no test checks.

export const CLI_NAME = "orkeon-code";
export const CLI_VERSION = "1.0.0-rc.3";
export const CLI_BUILD = "source";
/** The Orkeon runtime this version runs on: the commit of Orkeon's `main` pinned in .orkeon-version, which the
 *  launcher announces (tests/repository/version.test.ts keeps the two equal). A release tag is never the pin: the
 *  commands are checked against the sources at this commit (ADR 0013). /status and /doctor compare it with the
 *  commit of the runtime that runs them, read from the host's `runtime` service (Orkeon #225). */
export const ORKEON_RUNTIME_COMMIT = "5dc2ff3bcf1ef173402bc719b221106052dd165c";
/** The pin as the launcher and the rows print it: its first seven characters. */
export const ORKEON_RUNTIME_PIN = ORKEON_RUNTIME_COMMIT.slice(0, 7);

/** Whether a runtime's commit (as its build metadata carries it, short or full; null when none) is the pin: the
 *  pin, or at least seven leading characters of it. A commit with a suffix (`-dirty`: a build with local changes)
 *  is not the pin. */
export function isPinnedCommit(commit: string | null): boolean {
  return commit !== null && commit.length >= 7 && ORKEON_RUNTIME_COMMIT.startsWith(commit);
}
