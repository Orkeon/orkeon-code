# ADR 0021: Orkeon main after #298, the `firefox` browser that outlives the run

- **Status**: accepted
- **Date**: 2026-11-07
- **Amends**: [ADR 0020](0020-orkeon-after-295.md)

## Context

The pin of ADR 0020 is `4e4106a`. Orkeon #297 (`e598f8e`, 2026-11-07, on `main`) closes Orkeon #296, opened from
this project: the `firefox` browser of ADR 0019 closed with the agent run, so two consecutive turns of the console
never met the same window, and an action outside any run (`/debug-tool-call`) opened and closed a browser of its own.
`Orkeon:Tools:Firefox:Lifetime` now decides: `Run`, the default, is the former behaviour; `Host` keeps one browser
per profile, the disposable one included, with its tabs and its current tab, until `close`, the user closes the
window, or the host stops. `close` takes a `profile` outside a run; a run stays bound to the profile of its first
action; overlapping runs queue on the one browser of their profile; `SharedInstance` combines with it, each run
keeping tabs of its own; stale disposable folders under `ProfileRoot` are swept at the next start. Orkeon #298 (`b0fa31f`, the same day) then leaves out of an answer the
lists the action did not produce: `navigate` answered `"tabs": []` with a tab open, which read as no tab at all;
`nodes`, `hits`, `tabs` and `dialogs` are now absent rather than empty when the action did not fill them.

## Decision

- **The pin moves to `b0fa31f`** (`b0fa31f4d4078e4f4e4d624f0f1898c4b1abf3c8`), a merge commit of Orkeon `main`
  (ADR 0013); `.orkeon-version`, the status meta, the issue template, the guides; the typings of the crews and the
  commands are regenerated from it with `scripts/sync-typings.sh`.
- **No change to the tool classes.** `firefox` stays a network tool withheld in `plan` and `dontAsk` (ADR 0019),
  `close` keeps its execute access, and `profile` was already among the arguments the rules know
  (`TOOL_ARGUMENTS`), so `close` with a `profile` needs nothing new.
- **The setting is documented, not enabled.** The example settings leave `Lifetime` at its default: a browser that
  survives the turn is the operator's choice, in their own settings file.

## Consequences

- Under `Lifetime: host`, a browser already open stays open when the session switches to `plan` or `dontAsk`: these
  modes withhold the tool, so the agent cannot drive it, but the promise of no outbound request covers what the agent
  asks, not what a page already loaded does. The configuration guide says so.
- The text of a page kept across turns reaches the model unscreened at every turn that reads it, as it did within a
  turn (ADR 0019).
- Checks: `npm run check` green; `bash scripts/smoke-runtime.sh --mode source` at `b0fa31f`: 49 commands loaded, 0
  skipped, 0 conflicts. Live, headless, with `Lifetime: host` in a scratch settings file: `/debug-tool-call firefox`
  `navigate` on `https://example.com`, then `tabs` from a second call listed that tab as current, then `close`
  answered "The browser was closed." and left no Firefox running; the `navigate` answer carried no `tabs` list (#298). No model drove the tool.
