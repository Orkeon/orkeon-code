# ADR 0020: Orkeon main after #295, the rc shims removed

- **Status**: accepted
- **Date**: 2026-11-07
- **Amends**: [ADR 0019](0019-orkeon-after-293.md)

## Context

The pin of ADR 0019 is `f978001`. Orkeon #295 (`4e4106a`, 2026-11-07, on `main`) removes every compatibility shim
the `1.0.0-rc.*` line had kept, with no `[Obsolete]` step: the retired settings keys lose their migration hint,
`edge_kinds` no longer reads the `EdgeKind` member names (`ProjectDepends`), `incremental_reindex` loses `languages`
and `enrich_with_llm` with the fallback path that read them, the embedding provider records its model name in the
`index_codebase` cache key, and `orkeon-cli.d.ts` no longer announces the `aborted`/`throwIfAborted` aliases of
`CommandSignal`. Orkeon Code made the same move on its side the same day (`refactor/drop-runtime-fallbacks`): the two
belong together.

## Decision

- **The pin moves to `4e4106a`** (`4e4106a988592dd05fd37187453fb9adf100a666`), a merge commit of Orkeon `main`
  (ADR 0013); `.orkeon-version`, the status meta, the issue template, the guides; the typings of the crews and the
  commands are regenerated from it with `scripts/sync-typings.sh`.
- **`incremental_reindex` knows four arguments** (`changed_files`, `from_commit`, `root_path`, `to_commit`): a rule
  naming `languages` or `enrich_with_llm` on it no longer matches anything.
- **Nothing else changes.** The prompts already name the edge kinds in lowercase (`calls`, `inherits`…), no command
  reads the signal aliases, and the example settings hold none of the retired keys.

## Consequences

- An `index_codebase` cache built before the pin misses once and is rebuilt, since its key now carries the model name.
- A settings file holding a retired key (`Orkeon:TypeSafe:Guard`, `Memory:ConnectionString`…) is refused as any
  unknown key is, without the hint that named its replacement (configuration guide).
- Checks: `npm run check` green; `bash scripts/smoke-runtime.sh --mode source` at `4e4106a`: 49 commands loaded, 0
  skipped, 0 conflicts. No model drove the tools at this pin.
