# ADR 0023: Orkeon main after #304, `onToolCall` before the gate and the FWK lots

- **Status**: accepted
- **Date**: 2026-11-08
- **Amends**: [ADR 0021](0021-orkeon-after-298.md), [ADR 0022](0022-host-path-spellings.md)

## Context

The pin of ADR 0021 is `b0fa31f`. Two merges followed on Orkeon `main` the same day:

- **#299** (`b8ff145`), the 28 framework lots (FWK) and their reviews: MCP authentication and Streamable HTTP, the
  cognitive memory wired into the runners, checkpoints and durable human input, a retry per task (`retry:` replaces
  the graph's `maxRetryCycles`), the YAML `graph:` block, a mock provider and `orkeon run --test`, record and replay of
  model calls, plugin manifests, an LLM judge on a task's input and output. Two of its breaking changes reach this
  project: the input guard's section `Orkeon:Decision:Guard` moves to `Orkeon:Guardian:Llm`, fail-closed by default;
  the VFS now resolves every link on a path and refuses one whose real location leaves its mount.
- **#304** (`21b64c1`) closes the four issues ADR 0022 left to the runtime: #300 (a quoted path with spaces in the
  shell's outbound rewrite), #301 (the case and `C:/` of a Windows base), #302 (`Orkeon:Tools:Shell:WindowsPaths`,
  the Windows spelling of a mount under WSL for a Windows program) and #303: `ctx.llm.act` runs `onToolCall` first and
  consults the permission gate once, on the input the callback returns. Through the host's invocation pipeline the
  callback already ran before the gate since #299.

## Decision

- **The pin moves to `21b64c1`** (`21b64c1248954d9b42020b1cb92248846bc9cf87`), a merge commit of Orkeon `main`
  (ADR 0013); `.orkeon-version`, the status meta, the issue template, the guides; the typings are regenerated with
  `scripts/sync-typings.sh` (additions only: `onToolCallDelta`, `taskBuilder().retry()`, the `test` namespace of
  `orkeon run --test`).
- **The callbacks keep their checks, their order changes.** The dev crews' `onToolCall` (rule sets, roots, the path
  lists of ADR 0022, the pre-tool hooks) now runs before the gate, which judges the input it returns: a call spelled
  `C:\…` is converted, then judged once on its canonical spelling, so ADR 0022's limit is gone. The callback can
  still only refuse. The code, the guides (`architecture`, `permissions`, `hooks`, `headless`) and `/permissions`
  say so.
- **No setting is renamed in the examples**: none of them holds `Orkeon:Decision:Guard`; the configuration guide
  names the new section.

## Consequences

- A `pre-tool` hook runs for a call the gate then refuses, and before the gate asks the operator; a `post-tool`
  hook still runs only after a call that ran.
- The tool-call budget of a `/dev-batches` batch counts a call the gate then refuses; the budget only gets stricter.
- A folder of the project that is a link out of `/workspace` (a dependency cache linked to another checkout) is no
  longer readable through the mount; mount that folder of its own instead.
- Checks: `npm run check` green; `bash scripts/smoke-runtime.sh --mode source` at `21b64c1`: 49 commands loaded, 0
  skipped, 0 conflicts. No model drove a call: the hook order and the `C:\…` conversion were not checked live.
