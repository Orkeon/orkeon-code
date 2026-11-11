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
  - *pruning the context* (`compaction.prune`): inside a turn's tool loop, past a share of the window, the older
    results of the read tools are judged, the large ones and a bounded number at a time, and kept, cut down to
    their head or removed. The results live in the runtime's loop and never in the session buffer, so this rides
    the runtime's `onContextPressure` (Orkeon #327, asked for by this ADR's first draft); the summary of the
    buffer is untouched. A verdict answered to the runtime is final for the loop, so a result judged needed is
    left unanswered and judged again later;
  - *routing the agents* (`route.agents`, `route.ladder`): at its launch a crew gets the cheapest profile of the
    ladder that fits the command, raised to the floor a rule of the project sets, never above the session's;
  - *suggesting skills* (`skills.suggest`): the few skills that fit the request join the turn's attached skills, for
    that turn.
- **Names say the feature, never the provider.** No command, key, file, message nor identifier carries the name of a
  decision model: `prune`, `route` and `suggest` are what a user turns on, whatever answers behind. A provider's name
  appears in the pages that configure the providers, in this ADR's context and where a message names the host
  setting to fill (`Orkeon:Decision:Provider`, `Orkeon:TypeSafe`).

## Consequences

- With a decision model configured and the keys left off, nothing changes. The three uses are measured before any
  becomes a default.
- The quality of a prune, a route or a suggestion is the decision model's: the small open-weights models answer
  some questions poorly ([decision models, locally](../decision-models-local.md)). Each use reads a probability
  against a threshold of its own. Routing and suggesting fall back to the old path below it; pruning has no such
  side: under its threshold a result is cut or removed, and what bounds a wrong answer is that only the result of a
  read tool is ever offered, with a line that says to run the call again.
- `system_one_decide` stays out of every built-in tool list: the model is not offered it by this ADR. Handing it to
  the assistant remains `/config set tools.extra system_one_decide`.
- Left aside: the refusal of a write by model and by path, and the move to a stronger model after refused writes.
  Routing chooses a profile, it forbids nothing; the permission rules stay the one place that refuses a call.
- The pruning as first planned is not what was built. Planned: judge the old tool calls of the session buffer
  before the summary, skip the summary when enough was freed (40 % of the window, or 8 000 tokens), a `pruned`
  outcome, `/compact --prune` and `/compact --stats`. The buffer holds no tool result (one line per call), so
  none of that exists: the pruning runs in the loop, and a log line says what each pressure judged, removed and
  cut. Only the main loop's act carries it; the sub-agents of the dev crews do not.
- Checked live on 2026-11-11 with the hosted Jev and with `kev-0.8b`: `system_one_decide` answers under both
  providers and its probabilities reach the script as numbers. One measured turn saved 73.5 % of its input tokens
  ([decision models, locally](../decision-models-local.md#a-measure-one-turn-with-and-without)). Not established:
  the judgement of the small open-weights models (the probe of `kev-0.8b` answered every question close to 0.5),
  and Liquid, which was not tried.
- The routing as first planned is narrower than what was built. Planned: a profile and an effort for each crew and
  each sub-agent. Built: a profile for a crew, at its launch. A sub-agent's act cannot change profile (the
  runtime's `act` takes a model of the agent's provider): routing those acts waits for the runtime. The effort is
  left to `/effort`, one setting with one owner. The main loop is not routed, so that its prompt cache keeps one
  model; the host's own `route` stage of a decision profile does that job for a request. The decision model reads
  the command as typed, which says little for a command without arguments (`/init`): the floors by crew are there
  for it. Probed live on `kev-0.8b` (four commands, 2026-11-11): the choice comes back with a confidence that
  is not the probability of the option picked (0.24 for a pick between two options), a figure each provider
  defines; the 0.6 bar is therefore read on the probability the answer gives its pick. Under the first reading,
  two commands were routed to `small`, two left to the session, and a
  plan described as a rewrite across modules was not sent to `large`. Its effect on cost and quality is not
  measured.
- The suggestion of skills needed a place to find them, which the plan had not: `/skills` lists what a person
  attached, not what a project holds. The skills are the `.md` files of `.orkeon/skills/` and the `SKILL.md` of the
  folders of `.claude/skills/`, the layout another assistant's skills already have, so a repository that keeps
  them is served without a copy. Not measured, and not run against a live decision model yet: a choice among up
  to 25 options is the question a small model is least likely to answer well.
- A suggested skill is a file of the repository a model picked, not one a person chose. The turn therefore reads
  it apart from the attached skills, as reference material under the request and the rules, and a skill marked
  `disable-model-invocation: true` is never offered. What still bounds a hostile file: the setting is off by
  default, three files of 4 000 characters at most, and the decision model must pick it; a description written to
  be picked for every request is not defended against.
