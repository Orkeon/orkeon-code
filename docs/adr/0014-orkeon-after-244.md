# ADR 0014: Orkeon main after #244, effort levels, a parallel index and an index cache

- **Status**: accepted
- **Date**: 2026-10-30
- **Amends**: [ADR 0013](0013-pin-on-orkeon-commit.md)

## Context

The pin of ADR 0013 is `3fcfbbe` (Orkeon #240). Orkeon `main` then merged five pull requests, up to `5fe53ac`
(2026-10-30):

- **#241**, an audit of Orkeon's documentation against its code: no change of the scripting surface.
- **#242**, `effort` takes `xhigh` and `max` beside `low`, `medium` and `high`, on the agent builder, the per-call
  options and `llm.profile`. A provider declares the levels its field knows; one that knows fewer (OpenAI's
  `reasoning_effort`, Ollama's `think`) sends the highest it knows below the one asked, and warns.
- **#243**, `index_codebase max_parallelism`: how many files the index build reads and parses at once (0, the default,
  one per processor). The index is identical whatever the degree.
- **#244**, an index cache between sessions: `index_codebase` saves the tree under
  `<root>/.orkeon/cache/raggable-tree/` (its own `.gitignore`), reloads it when no file changed (`hit`), reindexes the
  changed files when at most half changed and no package marker did (`refreshed`), and rebuilds otherwise (`miss`);
  `use_cache: false` rebuilds, then saves (`bypassed`). The response gains `cache` and `reindexed_file_count`.
- **#246**, three fixes found while adapting to #244, none of the scripting surface: an Anthropic `ctx.llm.act` turn
  that called a tool no longer fails on its second model call (#245); what a host tool allocates (`index_codebase`
  on a large repository) no longer counts against the script's memory limit (#247); the index cache drops the
  entries of another runtime version when it saves, and compacts its database when more than half of it is free
  (#248).

Three branches of Orkeon Code waited on these: `/effort xhigh|max`, `/analyze --parallel N` and `/analyze --rebuild`,
each with the typings edited by hand.

## Decision

- **The pin moves to `5fe53ac`** (`.orkeon-version`, `ORKEON_RUNTIME_COMMIT`), the typings are regenerated from a
  checkout at it, the hand edits of the three branches give way to them.
- **`/effort` offers the five levels**, `/analyze` takes `--parallel N` (`max_parallelism`) and `--rebuild`
  (`use_cache: false`), as their branches wrote them.
- **`/analyze` says what the cache did**: the index summary reads `cache` and `reindexed_file_count`, and the
  indexing line names the outcome (`hit`, `refreshed` with the files reindexed, `miss`, `bypassed`), so a second run
  that took seconds is explained, and so is a `--rebuild`. The dev steps that build the index when the session
  holds none say it the same way: `/dev-plan` on its `code index built` line, `/dev-spec` and `/dev-change` on the
  `inventory:` line of their end message.

## Consequences

- On a runtime before #244 the summary has no `cache` field: the line says nothing of a cache. On one before #242,
  `xhigh` and `max` fail the agent's build, as any unknown value did.
- The check made for this ADR: `npm run check` and the runtime smoke on `5fe53ac` in source mode.
