# ADR 0027: the decision model asked by Orkeon Code: prune, route, suggest

- **Status**: accepted
- **Date**: 2026-11-11

## Context

Since Orkeon #234 the host can put a decision model in front of an LLM: a small model that answers typed questions
with calibrated numbers, served by one of three providers the settings choose between (`Orkeon:Decision:Provider`:
TypeSafe's hosted Jev, the open-weights Kev, Liquid's hosted or local d1). Orkeon Code uses it through decision
profiles alone ([ADR 0010](0010-orkeon-after-234.md), the session key `llm.profile`): the host guards a request,
verifies an answer, routes a call between two profiles. Orkeon Code itself asks that model nothing.

A long session spends its tokens in three places a cheap, calibrated judgement could cut:

- the context fills with the outputs of old tool calls, and the compaction that follows pays one LLM call over the
  whole buffer to summarise what was mostly no longer needed;
- a crew and its sub-agents run on the session's model whatever the work, a lookup and a change across modules alike;
- a person attaches skills by hand (`/skills`), so a skill that fits the request is absent unless they thought of it,
  and one attached for an earlier request is paid for at every turn.

[optim-jev](https://github.com/Oqura-ai/optim-jev), a plugin for another assistant, addresses the same three with a
decision model. It cannot be installed here: it is made of that assistant's hooks, and it reaches one hosted provider
with a key of its own. Its three ideas can be written on what the host already configures.

The host registers a tool, `system_one_decide`, with the decision provider, whichever it is: a state, questions by
name (a choice among described options, a score on a scale, the probability of a yes), the answers by the same
names. A script reaches it as a member of the `tools` namespace.

## Decision

- **A port, `DecisionModel`.** `available()` and `ask(state, questions)`, the questions and the answers typed in
  `shared/domain/decision/questions.ts`. The adapter (`orkeon/decision-model.ts`) calls `system_one_decide` and reads
  its answers; the fake is `fake-decision-model.ts`. Orkeon Code names no provider and reads no provider section:
  the model that answers is the host's.
- **It fails open.** A host without a decision model, a call that fails and an answer that does not read (a question
  left out, a choice outside the options asked, a probability outside [0, 1]) are all `null`, and never an exception.
  A use case that gets `null` does exactly what it did before this ADR.
- **Three uses, each off until its session key turns it on**, each delivered on its own:
  - *pruning the context* (`compact.prune`): before the summary, each old tool call is judged, kept, cut down to its
    head or removed; the summary runs only when that freed too little;
  - *routing the agents* (`route.agents`, `route.ladder`): a crew or a sub-agent gets the cheapest profile of the
    ladder that fits its task, never one above the session's;
  - *suggesting skills* (`skills.suggest`): the few skills that fit the request join the turn's attached skills, for
    that turn.
- **Names say the feature, never the provider.** No command, key, file, message nor identifier carries the name of a
  decision model: `prune`, `route` and `suggest` are what a user turns on, whatever answers behind. A provider's name
  appears in the pages that configure the providers and in the link above.

## Consequences

- With a decision model configured and the keys left off, nothing changes. The three uses are measured before any
  becomes a default.
- The quality of a prune, a route or a suggestion is the decision model's: the small open-weights models answer
  some questions poorly ([decision models, locally](../decision-models-local.md)). Each use reads a probability
  against a threshold of its own, and falls back to the old path below it.
- `system_one_decide` stays out of every built-in tool list: the model is not offered it by this ADR. Handing it to
  the assistant remains `/config set tools.extra system_one_decide`.
- Left aside: the refusal of a write by model and by path, and the move to a stronger model after refused writes.
  Routing chooses a profile, it forbids nothing; the permission rules stay the one place that refuses a call.
