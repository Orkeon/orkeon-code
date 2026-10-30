// Static CLI metadata shared by /status (version) and /release-notes. No IO.
//
// Orkeon Code versions independently of the Orkeon runtime it runs on: the
// runtime is pinned to a commit of Orkeon's main in .orkeon-version, this one follows
// package.json (tests/repository/version.test.ts keeps the two equal). The counts and crew names in
// RELEASE_NOTES are pinned by tests/commands/_lib/status/meta.test.ts, which keeps them true.

export const CLI_NAME = "orkeon-code";
export const CLI_VERSION = "0.1.0-alpha.1";
export const CLI_BUILD = "source";
/** The Orkeon runtime this version runs on: the commit of Orkeon's `main` pinned in .orkeon-version, which the
 *  launcher announces (tests/repository/version.test.ts keeps the two equal). A release tag is never the pin: the
 *  commands are checked against the sources at this commit (ADR 0013). /status and /doctor compare it with the
 *  commit of the runtime that runs them, read from the host's `runtime` service (Orkeon #225). */
export const ORKEON_RUNTIME_COMMIT = "5fe53ac10b4b2c776ed29628bde5806f79155383";
/** The pin as the launcher and the rows print it: its first seven characters. */
export const ORKEON_RUNTIME_PIN = ORKEON_RUNTIME_COMMIT.slice(0, 7);

/** Whether a runtime's commit (as its build metadata carries it, short or full; null when none) is the pin: the
 *  pin, or at least seven leading characters of it. A commit with a suffix (`-dirty`: a build with local changes)
 *  is not the pin. */
export function isPinnedCommit(commit: string | null): boolean {
  return commit !== null && commit.length >= 7 && ORKEON_RUNTIME_COMMIT.startsWith(commit);
}

export const RELEASE_NOTES = [
  `${CLI_NAME} ${CLI_VERSION} (${CLI_BUILD})`,
  "",
  "First release as a standalone project.",
  "",
  "Crews: main-loop (the interactive loop behind /assistant), code-review, git-commit,",
  "       project-init, init-verifiers, session-compact, advisor, analyze, speech,",
  "       dev-verify, dev-learn, dev-plan, dev-spec, dev-change, dev-implement, dev-batches,",
  "       shared-memory-admit, agent-run.",
  "Commands: 48 slash commands; free text without a leading / goes to /assistant.",
  "Permissions: five modes (default, acceptEdits, plan, dontAsk, bypassPermissions),",
  "             deny/allow rules (argument patterns too) enforced by the host gate,",
  "             questions before writes and commands, /mode for the session default.",
  "Extra tools: tools.extra offers an MCP server's or a plugin's tools to the assistant.",
  "Speech: the MCP server of mcp/whisper, /transcribe [--then], /voice (dictation), /say (read aloud).",
  "Context: automatic compaction with a persistent breaker, snip-first /compact,",
  "         file restore after compaction, context pressure tiers.",
  "Models: /model switches the model per turn; /model list offers Llm:AvailableModels.",
  "Code intelligence: index, maps, dependency graph and symbol tools of the Orkeon runtime.",
].join("\n");
