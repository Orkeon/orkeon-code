# ADR 0019: Orkeon main after #293, the `firefox` tool

- **Status**: accepted
- **Date**: 2026-11-06
- **Amends**: [ADR 0018](0018-orkeon-after-291.md)

## Context

The pin of ADR 0018 is `839818d`. Orkeon #292 (`fe050ac`) changes the install documentation and scripts. Orkeon #293
(`f978001`, 2026-11-06, on `main`) adds `firefox`, registered by every shipped host: it drives the Firefox installed on
the host over WebDriver BiDi, one browser per agent run, on a disposable profile by default. The tool declares its
access per call: `navigate`, `back`, `snapshot`, `read`, `find`, `search`, `tabs`, `new_tab` and `switch_tab` read,
`screenshot` edits, `click`, `type`, `press`, `evaluate`, `close_tab`, `close` and a missing action execute.

A name in an agent's `.tools([...])` that the host does not register fails the act before any model turn, so a tool
filed in a built-in list reaches every runtime that runs the crew.

## Decision

- **The pin moves to `f978001`** (`f978001a717e155243a090a1154d36740e0b3484`), a merge commit of Orkeon `main`
  (ADR 0013); `.orkeon-version`, the status meta, the issue template, the guides; the typings of the crews are
  regenerated from it with `scripts/sync-typings.sh`.
- **`firefox` is a network tool** (`NETWORK_READ_TOOLS`): offered in `default`, `acceptEdits` and `bypassPermissions`,
  withheld in `plan` and `dontAsk` although the runtime lets its reads pass in plan. These two modes promise no
  outbound request, and a page load is one.
- **`declaredAccess` mirrors the tool's access** for the gateless fallback of the dev crews, its `screenshot` being an
  execute there: the table has no edit, and execute lets no more through.
- **Its arguments are known to the rules** (`TOOL_ARGUMENTS`), so a rule can name `url` or `action`.
- **No new prompt rule.** `WEB_TOOLS` derives from the network class, so the existing rule that the project comes
  before the web applies to `firefox`. Naming the tool took the header past its ceiling of 10 800 characters, so the
  refusal note says `is refused` for `comes back refused`, with the same meaning; the ceiling stays.

## Consequences

- In `default`, `navigate` and the other reads run without a question, like `web_scrape`, and the page text reaches the
  model unscreened for prompt injection. `click`, `type`, `press` and `evaluate` ask. `search` needs an embedding
  provider and sends the page's sections to it.
- The URL policy checks the addresses the agent names, not a page's sub-resources.
- The tool needs Firefox on the host and the source mode: the release runtimes (tool `1.0.0-rc.6`, docker `1.0.0-rc.5`)
  do not have it. The guard quoted above already applies to them for `edge_list` (ADR 0016), by a reading of their
  sources: `firefox` adds a second unknown name, not a new failure. This was not run on a release runtime.
- Checks: `npm run check` green; `bash scripts/smoke-runtime.sh --mode source` at `f978001`: 49 commands loaded, 0
  skipped, 0 conflicts. In the console at that commit, headless, `/debug-tool-call firefox` opened `https://example.com`
  with Firefox 159, returned its outline, refused `http://127.0.0.1:8080/` and left no browser running. No model drove
  the tool, so the approvals and the visible window were not exercised.
