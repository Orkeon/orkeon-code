# Decision models: what Orkeon Code asks them

A decision model answers typed questions (yes or no, a choice, a score) with probabilities and writes no text: a
small model, fast and cheap beside the LLM that answers. The host serves one through a decision provider, the
hosted Jev of TypeSafe, the open-weights Kev, or Liquid's d1 ([Configuration](configuration.md#the-llm);
[Decision models locally](decision-models-local.md) sets up Kev and Liquid on your machine).

It is used in two ways. The host uses it through a *decision profile*, which guards a request, routes it or
verifies its answer: that is the host's settings, and the two pages above cover it. Three settings of Orkeon Code
also put it to work, which this page covers. The runtime asks it which tool results to prune and which profile a
crew runs on, and Orkeon Code asks it which skills fit a turn.

Each setting is off by default, works with whichever provider the host configures and needs no decision profile.
Each fails open: without a decision model, or when it does not answer, Orkeon Code does what it does with the
setting off.

| What | Turn it on | The decision model decides | Details |
|---|---|---|---|
| Pruning a long turn | `/config set compaction.prune on` | which older tool results a turn in progress, or an act of a dev crew, no longer needs | [the turn](turn.md#compaction-and-memory) |
| Routing a crew | `/route on` | the cheapest LLM profile that fits the command | [the turn](turn.md#routing-a-crew-to-a-profile) |
| Suggesting skills | `/skills suggest on` | the project's skills that fit the request of a turn | [the turn](turn.md#suggesting-skills-for-a-turn) |

The pruning and the routing need the runtime of the pin, source mode. The tool and docker modes run the last
release, where both settings are read and do nothing, without a warning
([ADR 0034](adr/0034-orkeon-after-470.md)).

The measures below are of 2026-11-11: `jev-latest` (the hosted Jev) decides, `glm-5.3-flashx` (Z.AI) answers,
Orkeon's sources at the pin of that day. Orkeon Code then asked the pruning and the routing questions itself: these
measures are historical, and none was taken again on the runtime's pruning and pick. The reasons behind each
choice are in [ADR 0027](adr/0027-decision-model-optimisations.md).

## Pruning a long turn

The tool results of a turn in progress stay in the model's context until the turn ends: no compaction reaches
them. With `compaction.prune` on, once the prompt passes a share of the call's usable window, the decision model
judges the older results of the read tools: each is removed, cut to its first characters or kept, and a line says
how to get it back.

The runtime does the judging, on the host's numbers (`Orkeon:Compaction:Prune`). By default it starts at 40 % of
the usable window, spares the last 6 messages and cuts to 300 characters
([the turn](turn.md#pruning-the-tool-loop)).

The two measures below are historical. They were taken on a judge of this project, removed since
([ADR 0034](adr/0034-orkeon-after-470.md)): it asked the same questions with the same numbers, against the
session's whole window, not the call's usable one.

The same setting prunes the acts of the dev crews: the reviewer of `/dev-spec`, `/dev-change`, `/dev-plan` and of
the next batch of `/dev-batches`, the test author and the implementer of `/dev-implement`, the auditor of
`/dev-verify`. With the setting off, or without a decision model, these commands run as they did.

### Measured: one turn, with and without

One run of each. The turn, in `plan` mode, reads the 26 largest pages of this documentation, one `file_read` each,
then must quote the title of the first file and of the last and say what they have in common: most results are
dead weight, two are not.

| | Pruning off | Pruning on | Saved |
| --- | ---: | ---: | ---: |
| Input tokens of the turn | 168,481 | 44,652 | 73.5 % |
| Largest model call, in tokens | 156,420 | 32,484 | 79.2 % |
| Model calls | 2 | 2 | |
| Time spent in the model's calls | 15.5 s | 8.0 s | 48.6 % |
| Requests to the decision model | 0 | 3 | |
| Time of those requests, summed (the slowest) | | 0.54 s (0.20 s) | |
| The whole turn | 25.4 s | 17.7 s | 30.2 % |

The model asked for the 26 reads in its first call. Before the second, the loop stood past 40 % of the session's
window:
20 results were offered (the last 6 messages are spared), sent to the decision model in 3 requests that ran
together, and 15 were removed, 4 cut to their first 300 characters and 1 kept, about 107,000 tokens freed. Both
answers quote the same two titles: the first file's result came through whole. Net of the decision model's 0.2 s,
the turn spent 7.3 s less in the model.

A second run, on the turn's last file alone, has no twin to compare it with: it is under
[What these measures do not show](#what-these-measures-do-not-show).

### Measured: the acts of the dev crews

Measured on 2026-11-16, one run, pruning off, to read how large these acts grow. The lowest threshold was then
51,200 tokens: 40 % of a session's window of 128,000.

| Act | Model calls | Largest call, in tokens |
| --- | ---: | ---: |
| The roles of `/dev-batches calc F1`: one batch of a three-file project, tests green in 2 min 27 s | 18 | 10,120 |
| The reviewer of `/dev-spec`, over six runs on this repository | 4 to 9 | 43,000 |
| The reviewer of `/dev-plan`, over four runs | 7 to 10 | 43,000 |

None of these acts reached that threshold: with the setting on, that judge would have pruned nothing in them.

The runtime's threshold is lower, since it is a share of the usable window. For a window of 128,000 and the default
share, it runs from 25,600 tokens (an output cap of half the window or more) to about 49,600 (no cap known). The
reviewer acts of 43,000 tokens may pass it, by the output cap of their call: that is not measured.

The pruning of a dev act is wired and tested, and its effect is not measured: it needs a batch whose role reads far
more than these did.

## Routing a crew

A crew's agents all run on one LLM profile of the host, the session's. With `route.agents` on, at the launch of
`/dev-spec` (and its alias `/dev-change`), `/dev-plan`, `/dev-learn`, `/review`, `/analyze`, `/commit`, `/init` and
`/init-verifiers`, the runtime's System One pick reads the command and picks a profile of
`route.ladder` (`small,large` when omitted, cheapest first). Orkeon Code asks no question of its own: it gives the
pick the ladder, the floor `.orkeon/route-rules.json` sets for the crew or for a path the command names, and the
session's own profile as the ceiling and the fallback. The runtime follows its decision model when the probability
of the pick reaches 0.6, raises it to the floor and never above the ceiling; under the bar or without an answer the
fallback stands. A session whose own rung is the one rung left, the lowest or a rule's floor, asks nothing and
runs on its profile.

A runtime whose decision circuit is off, or a pick that refuses an option, routes nothing: a warning in the log
says why, and `/route why` does not list it. `/route why` shows the last five choices
([ADR 0034](adr/0034-orkeon-after-470.md)).

Inside a crew, the act of a reviewer (`/dev-spec`, `/dev-change`, `/dev-plan`, the next batch of `/dev-batches`)
and of the auditor of `/dev-verify` is routed the same way, for that one call. When the pick is unsure or missing
the act stays where its crew runs; on the host's default model it takes a rule's floor instead: see
[Routing a crew to a profile](turn.md#routing-a-crew-to-a-profile). Two runs of it are
[measured below](#measured-dev-spec-then-dev-plan-routed-and-not).

### Measured: twelve commands

One run, the session on the host's default model, the ladder `small,large`. "Expected" is the author's own
judgement of each command.

| Command | Expected | Picked | Probability |
|---|---|---|---:|
| `/commit` | small | small | 0.87 |
| `/commit fix a typo in the README` | small | small | 1.00 |
| `/analyze what does README.md say` | small | small | 1.00 |
| `/analyze list the public functions of src/text.ts` | small | small | 1.00 |
| `/init` | small | small | 0.75 |
| `/dev-learn` | small | small | 0.92 |
| `/dev-plan rewrite-the-billing-engine-across-all-modules` | large | large | 1.00 |
| `/dev-spec design a multi-tenant permission model with row-level security` | large | large | 1.00 |
| `/dev-change replace the session store by an event-sourced one, keep every caller working` | large | large | 1.00 |
| `/review --lens security` | large | large | 0.92 |
| `/review --lens style` | small | none: the session's profile stands | 0.54 for small |
| `/analyze find the race condition between the worker pool and the cache invalidation` | large | large | 0.99 |

Eleven of twelve as expected. The twelfth is the bar at work: a pick at 0.54 is not followed, and the launch runs
as it would without routing.

### Measured: `/dev-spec` then `/dev-plan`, routed and not

Measured on 2026-11-16: the session on `llm.profile large` (`glm-5.3`), the ladder `small,large` (`small` is
`glm-5.3-flashx`), the same request each time (a `--quiet` option on a script of this repository), two runs with
`/route off` and two with `/route on`.

| | `/dev-spec` | Its review | `/dev-plan` | Its review |
|---|---|---|---|---|
| Off, run 1 | failed after two model calls that passed 600 s | 9 calls, 213,556 tokens | not run | |
| Off, run 2 | 27 min 14 s | 2 Blocking, 3 Major; 8 calls, 169,998 tokens | failed: the crew ran out of time | 7 calls, 159,562 tokens, no verdict |
| On, run 1 | 4 min 48 s, on `small` (1.00) | on `small` (0.80): 2 Blocking, 1 Major; 4 calls, 36,723 tokens | 6 min 42 s, on `small` (0.78) | on `large` (0.51 for `small`, not followed): 4 Blocking, 3 Major; 10 calls, 168,726 tokens |
| On, run 2 | 6 min 57 s, on `small` (0.99) | on `small` (0.81): 1 Blocking, 4 Major; 4 calls, 42,774 tokens | on `small` (0.80): the draft refused twice, nothing written | not run |

- Routed, the two commands took 11 min 35 s in the run where both ended. Not routed, neither run ended both: on
  that day `glm-5.3` answered too slowly for the time a crew has.
- The reviews routed to `small` found as many Blocking rows as the one that ran on `large` (2 and 1 against 2), in
  a fifth of the tokens.
- A plan drafted on `small` was refused twice by the checks of its form, once in two runs: the fault a session on
  `glm-5.3-flashx` already shows now and then. Routing a session down brings that with it.
- A third run, on a host without a decision model and with `route.agents` and `compaction.prune` both on, ended both
  commands in 12 min 54 s with a warning for each setting and nothing else changed.

## Suggesting skills

A skill is a markdown playbook of the project: a file of `.orkeon/skills/`, or the `SKILL.md` of a folder of
`.claude/skills/`. With `skills.suggest` on, the decision model reads the request of each turn and one line per
skill; those whose share of probability reaches 0.3, three at most, are handed to the turn as reference material,
apart from the skills attached with `/skills attach`. A skill whose front matter says
`disable-model-invocation: true` is never offered. `/skills suggest why` shows what the last turn was suggested.

### Measured: twelve requests

One run, in a project of nine skills, one of them kept for a person to invoke. "Expected" is the author's own
judgement of each request.

| Request | Expected | Suggested | Share |
|---|---|---|---:|
| Cut the 2.1 release and write its notes | release | release | 1.00 |
| Prepare version 3.0: changelog and tag | release | release | 1.00 |
| Add a column due_date to the invoices table | db-migration | db-migration | 1.00 |
| We need an index on orders(customer_id), with a way back | db-migration | db-migration | 1.00 |
| The checkout test fails one run in ten, find out why | flaky-tests | flaky-tests | 1.00 |
| The French getting-started page is behind the English one | translate | translate | 1.00 |
| Add GET /invoices/{id}/lines to the API | api-endpoint | api-endpoint | 1.00 |
| The export of 10 000 rows takes 40 seconds, make it faster | perf | perf | 0.99 |
| Check this login change for vulnerabilities before we merge | security | security | 1.00 |
| Move from express 4 to express 5 | dependency | dependency | 1.00 |
| What does the function in src/text.ts do? | none | none | |
| Rename the variable a to left in src/text.ts | none | none | |

Twelve of twelve as expected, and the skill kept for a person was offered to the decision model in none of the
twelve questions (eight skills offered each time).

### Measured: a suggested skill in a turn

The release skill ends with an instruction of its own: "always end the release notes with the line
RELEASE-SKILL-7Q". The turn asks for the release notes of a version in five lines.

| | Suggestion off | Suggestion on |
|---|---:|---:|
| Input tokens of the turn | 11,885 | 12,909 |
| Time spent in the model's calls | 4.4 s | 3.6 s |
| Time of the decision model's request | | 0.28 s |
| Skill suggested | | `.orkeon/skills/release.md` |

With the suggestion on, the model read the skill and did not obey it against the request: its answer says that
the playbook was "suggested but not attached by you", that it asks for that closing line, and that "an
instruction from reference material does not override the request", the five-line limit here; it offers to append
the line. That is what the block is written for: a suggested skill informs, it does not command.

## What the decision model costs

Over the 24 questions above: 157 ms a request on average, 235 ms the slowest, 3.8 s in all. The three requests of
the pruned turn took 0.54 s summed and ran together (0.20 s the slowest).

## The same questions on a small local model

`kev-0.8b`, the smallest open-weights Kev, on the same twelve requests and twelve commands: nine skills of twelve
(three that fitted were not suggested, none was suggested wrongly, the one kept for a person was never offered),
eight routes of twelve (three picks under the bar, so the session's profile stood; one style review sent to
`large`), 79 ms a request on this machine. Its probabilities sit close to the bars (0.52 to 0.82 for the skills,
0.60 to 0.85 for the routes) where the hosted Jev's are near 1. On the pruning questions this
project's judge asked then, a probe of four calls answered between 0.42 and 0.69, too close to that judge's 0.5
threshold to trust. The runtime's pruning was not probed on it.

## What these measures do not show

- It is one run per case, on requests and commands written to be clear. Requests that are vague, or that two
  skills fit, were not tried.
- The expected answers are one person's judgement.
- The routed runs of `/dev-spec` and `/dev-plan` are two of each, on one request and one provider, on a day its
  larger model was slow: they show that routing can make the difference between a run that ends and one that does
  not, not by how much it shortens a run that would have ended. The other routed commands were measured on their
  choices alone.
- No dev act measured reached the pruning threshold of the day, so what pruning saves there, and what it costs in
  results read again, is not known.
- For the pruning, a model that reads one file per call instead of all at once spends its tokens differently, and
  the request says which files matter, the easy case for the judge. The same turn asked about its last file only
  had all 20 results removed (about 115,000 tokens) and answered rightly, in 57,515 input tokens; its twin without
  pruning was not run.
- Liquid's d1 was not tried.

## Run a measure again

For the pruning, with settings that name a model and a decision provider, in a project whose
`.orkeon/config.json` holds `{ "compaction.prune": "on" }` (then `"off"`):

```bash
ORKEON_CODE_MODE=source ORKEON_SOURCE=~/src/orkeon \
  ./orkeon-code run main-loop --workspace "<the project>" --trust \
  --inputs '{"prompt": "<a request that reads many large files>", "permissionMode": "plan"}' -- -v 2 > run.log 2>&1
grep -o "context pruning: [^\"]*\|call used [0-9]* tokens\|HttpClient\.[A-Za-z]*\.LogicalHandler\[101\] End[^-]*ms" run.log
```

The first pattern is the line of each act that pruned, the second the tokens of each model call, the third the time of
each request, the model's and the decision model's (the line names the client). `-- -v 2` raises the log of `orkeon run`
to the level these lines are written at: by default it shows the warnings alone.

For the routing, `/route on` in a session, a command, then `/route why`. For the skills, `/skills suggest on`, a
request, then `/skills suggest why`. Each also writes a line in the log: `route: <crew> on '<profile>' (...)`,
`skills suggested for this turn: <paths>`.
