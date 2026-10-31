# ADR 0014: Orkeon main after #244, effort levels, a parallel index, an index cache and the prompt cache

- **Status**: accepted
- **Date**: 2026-10-30
- **Amends**: [ADR 0013](0013-pin-on-orkeon-commit.md)

## Context

The pin of ADR 0013 is `3fcfbbe` (Orkeon #240). Orkeon `main` then merged twelve pull requests, up to `151a762`
(2026-10-31):

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
- **#253** and **#255**, fixes of the code analysis found while running `/analyze`, none of the scripting surface:
  `package_summary` picks its entry points by name and reports a package's dependencies (#249, #250), `.gitignore`
  character classes are honoured (#251), and a C# `using`, a Go `import` and a Rust `use` draw import edges (#252).
- **#256**, the prompt cache from scripts (#254): `agentBuilder().cache({ systemPrompt?, tools?, ttl? })` and the
  `cache` key of `LlmConfig.with`, a host default `Llm:Cache`, and the usage report and `session_stats` keep a cache
  or reasoning count no call reported null (absent) instead of 0. Before it, no script agent could ask Anthropic to
  cache, so Orkeon Code paid every prompt at the full rate.
- **#258** and **#259**, none of the scripting surface: the index reads `.git/info/exclude` and the nested
  `.gitignore` files, not the root one alone; `claude-haiku-5` is priced and every Anthropic model declares its cache
  write and read rates (#257), so `costUsd` is no longer unpriced on Haiku 5.5 and a cached prompt is costed at its
  own rate (a 1-hour write at the 5-minute rate: the usage event carries no TTL).
- **#261**, a count mode in `grep` (#260): `output_mode: "count"` answers `total_matches`, `files_matched` and the
  per-file `counts` with no hit line, and both modes report `total_matches` and `scan_complete`, so a "how many"
  question over a tree takes one call.
- **#264**, a batched `session_store` (#263, opened from Orkeon Code): `get_state` reads several `keys` in one call
  and answers `values` (a key never set is absent), `set_state` writes several `values` and removes several `keys`,
  and `append_message` adds one message at the end of the buffer without returning or rewriting it.

Three branches of Orkeon Code waited on these: `/effort xhigh|max`, `/analyze --parallel N` and `/analyze --rebuild`,
each with the typings edited by hand.

## Decision

- **The pin moves to `151a762`** (`.orkeon-version`, `ORKEON_RUNTIME_COMMIT`), the typings are regenerated from a
  checkout at it, the hand edits of the three branches give way to them.
- **`/effort` offers the five levels**, `/analyze` takes `--parallel N` (`max_parallelism`) and `--rebuild`
  (`use_cache: false`), as their branches wrote them.
- **`/analyze` says what the cache did**: the index summary reads `cache` and `reindexed_file_count`, and the
  indexing line names the outcome (`hit`, `refreshed` with the files reindexed, `miss`, `bypassed`), so a second run
  that took seconds is explained, and so is a `--rebuild`. The dev steps that build the index when the session
  holds none say it the same way: `/dev-plan` on its `code index built` line, `/dev-spec` and `/dev-change` on the
  `inventory:` line of their end message.
- **Every agent requests the prompt cache** of its system prompt and its tool definitions, for the vendor's default
  lifetime: `profiledAgent` (`orkeonAgent()`, where every composition root starts an agent) calls
  `.cache({ systemPrompt: true, tools: true })`. The prompts are assembled so that this prefix stays byte-identical
  turn after turn, which is what the cache needs. Anthropic caches only what a request marks; the other providers
  cache by their own rules and ignore the request.
- **An unreported count stays unreported**: the usage reader keeps a null cache or reasoning count null, and `/usage`
  shows it `-`.

## Consequences

- On a runtime before #244 the summary has no `cache` field: the line says nothing of a cache. On one before #242,
  `xhigh` and `max` fail the agent's build, as any unknown value did.
- An agent's own `.cache(...)` wins over the host default `Llm:Cache`: a host cannot turn Orkeon Code's cache off
  from its settings. On a runtime before #256, `.cache` does not exist and every agent fails its build.
- The check made for this ADR: `npm run check` and the runtime smoke on `151a762` in source mode.
