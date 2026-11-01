# ADR 0015: Orkeon main after #276, the context apart from the request

- **Status**: accepted
- **Date**: 2026-11-01
- **Amends**: [ADR 0014](0014-orkeon-after-244.md)

## Context

The main loop sent each turn in two messages: the system header, then one user body that held, in a fixed order,
the preferences, skills, memory, hooks, history, environment and context gauge, with the request last. A decision
profile's `guard` and `route` stages judge the last user message (ADR 0010): they read the request together with
everything in front of it, and a risky request, buried under a long history, scored as benign. Orkeon #276 reported
that dilution.

Orkeon #277 (`549987d`, 2026-11-01, on `main`) answers it with `ActOptions.context`: a user message of its own,
placed after `system` and before the prompt. The prompt stays the last user message, the one the stages judge.

The same `main` names the members of each cycle in `dependency_graph` (`cycles[] {edge_kind, fqns, member_count}`,
`cycles_truncated`, the follow-up of Orkeon #272/#273): `/analyze` could only say that the index counts the module
cycles and does not name their modules.

## Decision

- **The pin moves to `549987d`**, a merge commit of Orkeon `main` (ADR 0013): `.orkeon-version`, the status meta,
  the issue template, the guides; the typings are regenerated from it (`context?: string`).
- **The main loop sends its context apart.** `prompt-assembly.ts` builds `ContextParts` into the context
  (`assembleContext`), the request with its permission note and proactive suffix is the prompt alone; the port's
  `ActRequest` gains `context`, the adapter hands it to `ActOptions.context`. The stop retry rebuilds the request
  only. The prompt contract pins it: the request is sent alone, the volatile blocks go to the context.
- **The release keeps working.** The tool and docker installs run `1.0.0-rc.6`, whose act ignores `context`: the
  context would be lost. The adapter tells the runtimes apart by the agent builder: no `.cache` (Orkeon #256) means
  a runtime before #277, and there it puts the context in front of the request in one message, as before
  (`runtimeTakesActContext`, `LlmDefaults.contextApart`).
- **`/analyze` names the module cycles.** `readGraph` reads `cycles` and `cycles_truncated`; the harvest lists one
  line per cycle with its size and its first members, says how many of the cycles it names when the index sampled
  them, and keeps the old line for an index that counts without naming.

## Consequences

- On the pin, a guard judges the request alone: the history and the memory no longer dilute it. The provider's
  prefix cache covers the system and the context as before, since their order is unchanged.
- On `1.0.0-rc.6`, the turn is the one message it was, and the guard sees the dilution #276 described. A checkout of
  Orkeon between #256 and #277 has `.cache` and no `context`: it would drop the context. The launcher moves a source
  checkout to the pin, so only a checkout pinned by hand there meets it.
- The check made for this ADR: `npm run check` and the runtime smoke on `549987d` in source mode, then a live run
  (2026-11-01, Kev `kev-4b`, profile `guarded-test`): behind three turns of history, a direct injection is blocked at
  0.71 and a hidden one at 0.59, two harmless requests pass, and the history and the git context still reach the
  model.
- The pin then follows Orkeon `main` to `c727c06` (Orkeon #278: a right click in the console input no longer flashes
  the native context menu). Nothing of the scripting surface changes: the typings are the same.
