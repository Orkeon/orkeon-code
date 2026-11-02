# ADR 0016: Orkeon main after #280, the edge list, bounded analysis results and a persisted memory

- **Status**: accepted
- **Date**: 2026-11-02
- **Amends**: [ADR 0015](0015-orkeon-after-276.md)

## Context

The pin of ADR 0015 is `83cd91d` (Orkeon #279). Orkeon Code's prompts audit of 2026-11-01 found that several of its
prompts made up for the runtime rather than for the model: the routing could not name every inheritance edge of a
project, the graph tools' `truncated` and `cycles` fields came last and the default cut of 4 000 characters removed
them first, the analysis tools published no parameter schema, `session_snip.retain_count` counted messages where its
description said exchanges, and `memory_store` lived in memory only. Beside #280 (every edge of a kind across the
index), the audit opened six Orkeon issues, the fourth section of its report:

- **#282**: every analysis tool publishes its parameter schema, enums as literal unions;
- **#283**: `truncated`, the counts and the cursor come first and the renderings last, `include_mermaid` is false by
  default, the twelve analysis tools are bounded at 12 000 characters, and `truncated` means "more exist than
  returned" everywhere;
- **#284**: each tool description opens with the question it answers, names its neighbour and its bound;
  `rag_search` no longer offers the code index as a collection;
- **#285**: `ctx.llm.extract` takes a `system` option and a `messages` form, and sends its schema as a `json_schema`
  response format where the provider has one;
- **#286**: `memory_store` persists per project when `Orkeon:Cli:Memory:Persist` is on (the REPL turns it on when the
  key is absent) and gains `replace`;
- **#287**: `session_snip.retain_count` counts turns, a turn being a user request with the tool traces and the answer
  that follow it.

Orkeon #281 (`a685233`, 2026-11-02, on `main`) closes all seven, and adds `edge_list`, the inheritance of
`symbol_detail` as FQNs (`extends`, `implements`, `derived_by`, `implemented_by`) and `inherits` on `flow_trace`.

## Decision

- **The pin moves to `a685233`** (`a685233b5f7c83d475e18ebd62a03f091a04e7ed`), a merge commit of Orkeon `main`
  (ADR 0013): `.orkeon-version`, the status meta, the issue template, the guides; the typings are regenerated from it.
- **Orkeon Code adopts**:
  - the `edge_list` routing: a question about every edge of a kind across the project (who extends or implements
    what) goes to `edge_list`, under a `root_fqn` or not, paged by its cursor, and the inheritance of one symbol to
    `symbol_detail` (`expand: "Inheritance"`); `edge_list` is a read tool of every mode, its arguments known to the
    permission rules, and `/doctor` counts it among the code-intelligence tools. The reviewer and the auditor do not
    get it: they judge a diff, and `symbol_detail` answers the inheritance they need;
  - the turns-based snip: the compaction asks `session_snip` for turns (`SNIP_RETAIN_COUNT`, two, when a summary
    fails; three for `/compact --snip`), converted to the runtime's count, since a turn here stores its
    `[turn-context]` as a user message before the request (`runtimeTurnsToKeep`); a buffer that holds too few turns
    is not snipped, and `kept_from` is not read;
  - the persisted memory and its `replace`: the example settings turn `Orkeon:Cli:Memory:Persist` on, and the
    launchers set `Orkeon:Cli:Memory:RootDirectory` to `/memory`, a folder of the project's state beside the sessions,
    outside the project; without the launcher the example settings name `/workspace/.orkeon/typed-memory`, since the
    runtime's default, `/workspace/.orkeon/memory`, is the shared memory's folder. The memory extraction
    lists the known entries by id, the newest first (`list { newest_first }`), and a fact that makes one out of date
    names it (`replaces`): the entry is replaced in place, or the fact added when the store refuses;
  - the tool descriptions and parameter schemas the runtime now publishes: the header stops spelling out what they
    carry (how `codebase_search` matches, the pattern syntax of `structural_search`, the code index as a
    `rag_search` collection);
  - the 12 000-character bound: the example settings drop the nine `Orkeon:Tools:ResultLimits:Limits` entries at
    12 000 they added for the graph and search tools, now the runtime's default (`shell_command` stays, at its
    default, to show the key). The code-index port types the level it asks for (`MapLevel`: `L1_Package`,
    `L2_Module`, `L3_Symbol`), since the typings now give `codebase_map.level` and `dependency_graph.scope` as
    unions; the adapter still sends `include_mermaid: false`, which a release before #283 needs.
- **Orkeon Code does not adopt yet** the `system` option and the `messages` form of `extract` (#285): the ports keep
  `extract(prompt, schema)`. The `json_schema` response
  format comes without a change wherever the provider supports it, since the adapter already hands a schema object.

## Consequences

- On the pin, an analysis result reaches the model whole up to 12 000 characters, and a cut one still says it is
  partial and how much exists. On `1.0.0-rc.6` and the last image the analysis tools are cut at 4 000 characters
  again, `truncated` last, and `edge_list` does not exist: a user of those modes who wants the wider cut sets the
  `Limits` entries back ([Configuration](../configuration.md)). As with the features the release lacked in ADR 0015,
  the header still routes "every edge of one kind" to `edge_list`, which the model is then told is unknown, and
  `/doctor` warns `absent: edge_list` there.
- `session_snip` and `memory_store` changed their contract (#286 and #287 are breaking): Orkeon Code follows the
  pin's, and a release keeps the memory of one process. Its `session_snip` counts messages: the session adapter tells
  it by the absence of `edge_list` (they came in the same merge) and sends the number of messages the asked turns
  hold, measured on the buffer, so the release keeps the same tail as the pin.
- **The typings of this pin do not parse as Orkeon generates them.** The roll-up of `Orkeon.Scripting.csproj` carries
  each line as an MSBuild item, which turns the escaped comment closer `*\/` into `*//`: five doc comments (the
  `glob` description, `structural_search.glob`, `structural_rewrite.glob`, `rag_ingest.sources` and a paths field of
  the file tools) close early, and TypeScript stops at 577 errors. The five lines are patched by hand in
  `src/crews/.orkeon/orkeon.d.ts`; `scripts/sync-typings.sh` would undo the patch, so it is not run at this pin. Orkeon
  Code reported the roll-up to Orkeon as #288 (2026-11-02), and the pin moves again to the commit of Orkeon `main`
  that fixes it, the typings then regenerated as they come.
- Checks: `npm run check` green (7 316 tests, type check, 67/67 bundled, provenance strict, generated docs, docs
  parity); `bash scripts/smoke-runtime.sh --mode source` on an Orkeon checkout at `a685233` plus the #288 fix
  (`80779af3`): 48 commands loaded, 0 skipped, 0 conflicts, the `/memory` mount accepted.
