# ADR 0014: Orkeon main after #244, effort levels, a parallel index, an index cache and the prompt cache

- **Status**: accepted
- **Date**: 2026-10-30
- **Amends**: [ADR 0013](0013-pin-on-orkeon-commit.md)

## Context

The pin of ADR 0013 is `3fcfbbe` (Orkeon #240). Orkeon `main` then merged fifteen pull requests, up to `2e3ec51`
(2026-11-01):

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
  own rate (a 1-hour write at the 5-minute rate until #266, which costs its share at 2x).
- **#261**, a count mode in `grep` (#260): `output_mode: "count"` answers `total_matches`, `files_matched` and the
  per-file `counts` with no hit line, and both modes report `total_matches` and `scan_complete`, so a "how many"
  question over a tree takes one call.
- **#264**, a batched `session_store` (#263, opened from Orkeon Code): `get_state` reads several `keys` in one call
  and answers `values` (a key never set is absent), `set_state` writes several `values` and removes several `keys`,
  and `append_message` adds one message at the end of the buffer without returning or rewriting it.
- **#266**, the review of rc.6 and two more decision providers. For a script: a cancelled exclusive launch holds its
  crew until its work has really ended, and a synchronous `runCrew` of a crew an exclusive launch holds is refused;
  `session_store` declares its access per operation, so `plan` mode refuses its writes when a model calls them (a
  script's own call is not gated), and `set_state` with several keys is atomic; an Anthropic turn that thought before
  calling a tool replays its signed thinking blocks, so `effort` with tools no longer fails the next call;
  `retry-after-ms` takes precedence over `Retry-After`; an `effort` outside the five levels, a cache `ttl` alone and a
  second `.when()` or two tasks of one name are refused at load. The host serves TypeSafe, Liquid or Kev as its
  decision model (`Orkeon:Decision:Provider`), and the guard section is `Orkeon:Decision:Guard`. The typings change in
  their comments only.
- **#271**, the decision stages, fixes of issues opened from Orkeon Code's trial of Kev and d1 (#267 to #270): a
  `verify` judges the answer and lets a response that calls tools pass (`Steps: "final"`, the default; `"all"` judges
  the steps too), so an agent loop no longer escalates at every step; a guard or a verify sends `instructions` with
  each yes or no question, which d1 refused without; a blocked call rejects in a script with a `DecisionBlockedError`
  (`errorType: "DecisionBlocked"`, `profile`, `stage`, `risk` for a guard, `reason`; `onError` code
  `decision_blocked`) instead of resolving to an `<undefined-llm:...>` marker; the stage log prints no `(null)`.
- **#273**, `dependency_graph` names the members of each cycle (#272, opened from Orkeon Code's `/analyze`): the
  response carries `cycles` (`fqns`, `member_count`, `edge_kind`, the largest first), bounded by `max_cycles` and
  `max_cycle_members`, with `cycles_truncated`; an empty `edge_kinds` searches the cycles over the imports, the edges
  it draws. The typings gain these fields.

Three branches of Orkeon Code waited on these: `/effort xhigh|max`, `/analyze --parallel N` and `/analyze --rebuild`,
each with the typings edited by hand.

## Decision

- **The pin moves to `2e3ec51`** (`.orkeon-version`, `ORKEON_RUNTIME_COMMIT`), the typings are regenerated from a
  checkout at it, the hand edits of the three branches give way to them.
  `2e3ec51` is the squash merge of #273 on `main`. Before it the pin was `3860e9d`, the squash merge of #271, and
  first named `9c25b6c`, the last commit of the #271
  branch: same tree, but not on `main`, so the launcher could not move a source checkout of `main` to it and warned
  at every start.
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
- **A blocked turn is read off the typed block**: `decisionBlockOf` reads the `DecisionBlockedError` of #269 (its
  `errorType`, `profile`, `stage`, `risk` and `reason`) instead of parsing the host's sentence out of a failure marker,
  and `/assistant` answers it as before. The d1 shim of the local decision models page no longer rewrites the yes or
  no questions (#268).
- **An unreported count stays unreported**: the usage reader keeps a null cache or reasoning count null, and `/usage`
  and `/context` show it `n/a`.

## Consequences

- On a runtime before #244 the summary has no `cache` field: the line says nothing of a cache. On one before #242,
  `xhigh` and `max` fail the agent's build, as any unknown value did.
- An agent's own `.cache(...)` wins over the host default `Llm:Cache`: a host cannot turn Orkeon Code's cache off
  from its settings. On a runtime before #256 (the `1.0.0-rc.6` release of the tool mode and of
  `scripts/run-crew.sh`, the `orkeon-runners` image of the docker mode), the builder has no `.cache`: `profiledAgent`
  requests the cache only where the builder has one, so the agents build there, without the prompt cache.
- On a runtime before #263 (the same releases), `append_message` is unknown: the tool answers it `success: false` with
  no error, which the binding throws as `tools.sessionStore failed: (no error message provided)`. On that failure
  alone the session adapter adds the message by reading and rewriting the buffer, as before #263, and remembers it:
  its next appends rewrite the buffer at once. Any other failure of an append, a blank role's included, is rethrown,
  never hidden behind a rewrite. A `get_state` over several `keys`
  that throws leaves each key read on its own (the state snapshot). The conversation is kept, at the old cost.
- On a runtime before #271 a block arrives as a failure marker, read as an `LlmFailure`: the turn fails with the
  host's sentence, as it did before #47 was fixed.
- The check made for this ADR: `npm run check` and the runtime smoke on `2e3ec51` in source mode.
