# ADR 0004: Orkeon main after #180, on the rc.6 pin

- **Status**: accepted
- **Date**: 2026-10-24
- **Amends**: [ADR 0002](0002-orkeon-rc6.md)

## Context

Orkeon #180 is merged on Orkeon `main`; its typings still carry the directive `1.0`, and no tag holds it yet. It
changes the surface Orkeon Code runs on:

- **New tools.** The host registers file tools (`glob`, `grep`, `count_pattern`, `list_mounts`), the node readers and
  editors (`node_outline`, `node_read`, `node_replace`, `node_insert`, `node_ensure`, `edit_file`, `edit_batch`,
  `structural_rewrite`), graph queries (`access_cost`, `affected_tests`, `batch_anchors`, `documented_in`,
  `documents_of`, `structural_search`, `incremental_reindex`, `statement_query`, `complexity_report`), `github` and
  `rag_eval`. Each declares its access, except `github` and `rag_eval`.
- **`spawn_agent`** is the script host's own tool, offered to every act; naming it in `.tools([...])` throws
  `UnknownToolError`.
- **Arguments.** Existing tools gain fields (`file_read` `offset` and `limit`, `shell_command` `action`, `job_id` and
  `tail_lines`...). The gate reads a top-level argument only, as text.
- **Result limits.** The cut of a tool's result is set per tool (`Orkeon:Tools:ResultLimits`, 10,000 characters for
  `shell_command`) and the tool itself applies it, notice included; the read calls of a turn run four at once.
- **Rate limits.** `Llm:MaxRateLimitWait` bounds the window a call waits out.

## Decision

- **The same pin.** `.orkeon-version` stays `1.0.0-rc.6`; the surface Orkeon Code targets is Orkeon `main` after
  #180, the one that tag will carry.
- **Typings from the sources until the tag.** `scripts/sync-typings.sh` keeps reading the checkout named by
  `ORKEON_SOURCE`, as ADR 0002 decided.
- **This amends ADR 0002**, whose decision otherwise holds: no older runtime path, no capability probe.
- **The stricter shapes stay ours.** `src/shared/infrastructure/orkeon/runtime-tools.ts` keeps declaring the inputs
  and results Orkeon Code calls with, checked against the generated typings.

## Consequences

- The catalogue per mode offers the new tools in their class, `spawn_agent` is ruleable but named in no catalogue,
  and the arguments a rule may name follow the typings (`TOOL_ARGUMENTS`).
- The rule sets of the dev steps cover the new file tools: a path rule per tool that takes one `path`, the written
  text of each editing tool, and `edit_batch` and `structural_rewrite` denied whole where paths are protected, since
  the gate cannot read their paths. A step holds 407 rules ([Permissions](../permissions.md#rule-sets-of-the-dev-steps)).
  *Note (2026-10-24):* `edit_batch` is no longer denied whole: the crews' callback checks each
  operation as the editor it stands for, so a step held 438 rules. *Note (wave 7):* with the reads of `git config`,
  the versioned and option-led interpreters and `directory_search`, a step holds 481 rules, 483 with the two allows
  of `/dev-implement` ([Permissions](../permissions.md#rule-sets-of-the-dev-steps)).
- `orkeon run` keeps no session rules: a headless turn is decided by its mode alone
  ([Autonomous and embedded runs](../headless.md)).
- `/dev-verify` detects a cut result by the runtime's notice; the example settings set `ResultLimits` and
  `MaxRateLimitWait`.
- The dev steps no longer warn that the host cannot say whether its gate is on: the runtime always says.

## Alternatives considered

- **Wait for the tag before adopting #180**: every change would land at once on the release day, with the dev steps'
  rules missing the new tools until then, while the REPL already offers them.
- **A new pin ahead of the tag**: there is no published version to pin; the pin names what will be published.
