# ADR 0023: Orkeon main after #306, `onToolCall` before the gate and the FWK lots

- **Status**: accepted
- **Date**: 2026-11-08
- **Amends**: [ADR 0021](0021-orkeon-after-298.md), [ADR 0022](0022-host-path-spellings.md)

## Context

The pin of ADR 0021 is `b0fa31f`. Three merges followed on Orkeon `main` the same day:

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
- **#306** (`4357d82`) closes #305, opened from this project: the typings and the runtime's comments said the gate ran
  before `onToolCall`; they now say the order above, and `onToolResult`'s says a call the gate or the guardian refused
  reaches it as a `DENIED:` result through the host's invocation pipeline. It also closes #307: the `{ context }`
  verdict of `onToolCall`, which the runtime accepted and ignored, is removed from the typings and denied as an
  unknown shape. This project's callbacks never returned it (`ToolCallVerdict` is `allow`, `{ deny }` or `{ input }`).

## Decision

- **The pin moves to `4357d82`** (`4357d82c9aff67070592ddcf59d85f0666bb4094`), a merge commit of Orkeon `main`
  (ADR 0013); `.orkeon-version`, the status meta, the issue template, the guides; the typings are regenerated with
  `scripts/sync-typings.sh` (`onToolCallDelta`, `taskBuilder().retry()`, the `test` namespace of `orkeon run --test`; the
  `{ context }` verdict gone from `onToolCall`).
- **The callbacks keep their checks, their order changes.** The dev crews' `onToolCall` (rule sets, roots, the path
  lists of ADR 0022, the pre-tool hooks) now runs before the gate, which judges the input it returns: a call spelled
  `C:\…` is converted, then judged once on its canonical spelling, so ADR 0022's limit is gone. The callback can
  still only refuse. The code, the guides (`architecture`, `permissions`, `hooks`, `headless`) and `/permissions`
  say so.
- **No change to the tool classes**: no tool is added, removed or reclassified by the pin for this project.
- **No setting is renamed in the examples**: none of them holds `Orkeon:Decision:Guard`; the configuration guide
  names the new section.

## Consequences

- A `pre-tool` hook runs for a call the gate then refuses, and before the gate asks the operator. Through the host's
  invocation pipeline (the REPL's and `orkeon run`'s), a refused call comes back to the model, and to `onToolResult`,
  as a `DENIED:` result: the `post-tool` hooks run on it and the tool trace records it; a call the callback denies
  gets no result.
- The roles of `/dev-implement` reported a write on the callback's `"allow"`, which now comes before the gate: a write
  the gate or the operator refused would have been the role's own, and one in the plan folder would have failed the
  role. `report-writes.ts` now reports a write from its result, and none from a `DENIED:` one.
- The tool-call budget of a `/dev-batches` batch counts a call the gate then refuses; the budget only gets stricter.
- A folder of the project that is a link out of `/workspace` (a dependency cache linked to another checkout) is no
  longer readable through the mount; mount that folder of its own instead.
- The runtime's embedding guard runs in the REPL: it records the embedding model under
  `/workspace/.orkeon/embedding-fingerprint.json` and refuses to start when the model changed (exit 1), until the
  file is deleted; the getting-started guide lists the file. Not checked live.
- Checks: `npm run check` green; `bash scripts/smoke-runtime.sh --mode source` at `4357d82`: 49 commands loaded, 0
  skipped, 0 conflicts. No model drove a call: the hook order and the `C:\…` conversion were not checked live.
