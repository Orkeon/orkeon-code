# ADR 0011: The gates of an unattended run, and five dev commands instead of eight

- **Status**: accepted
- **Date**: 2026-10-29
- **Amends**: the dev workflow of [Architecture](../architecture.md#crews) (no earlier ADR decided it)

## Context

The owner reviewed the dev workflow on 2026-10-29, after a run of `/dev-batches` left alone on a plan. Two findings
came out of it.

- **Gates that opened.** A run meant to go on without a human let work through where it should have stopped or
  carried what it learned:
  - a next-batch review that could not run (no reviewer on the host, an answer that did not parse) went on to the
    launch as if it had found nothing;
  - the review's Major questions were printed, then lost: the batch they were about never saw them;
  - a GAPS verdict stopped the run and waited for a human to type the correction the verdict had already written;
  - an audit the step's budget stopped was neither a finding nor a round, so a batch whose audit never finished could
    loop.
- **Four commands too many.** The workflow had eight commands for one path: `/dev-spec` and `/dev-change` both wrote
  the first document, the model's route already telling a feature from a change; `/dev-implement` ran one batch with
  its own defaults beside `/dev-batches`, which ran the same chain for each batch; `/dev-verify` audited a batch the
  chain already audits. Each extra name was one more usage to learn, one more set of printed next steps, and lines
  the chains had to read back in two spellings.

## Decision

Part 1, the gates (the commit `9e8f44c`):

- **G1, a review that cannot run closes the gate.** No reviewer on the host, or an answer that does not parse: the
  batch is not launched, the log records it `stopped` with `BLOCKED — review not run (<reason>)`, and the next run
  reviews it again (a stop for Blocking questions still settles the review).
- **G2, the review's Major rows reach the batch.** Each Major question becomes a `stale: <question> — <evidence>`
  line at the end of the RED and GREEN prompts of the batch's first launch; a relaunch carries none.
- **G3, a GAPS verdict relaunches its batch by itself.** The verdict's Blocking and Major rows are the correction,
  the batch runs again in its worktree on a parallel run, and the log says `returned` then `relaunched`; three
  audit rounds since the last VALID at most, the third still GAPS goes to a human with its correction named. No
  setting: the bound is the behaviour.
- **G4, an audit the budget stopped counts as a round.** Its relaunch carries no correction, so the audit resumes;
  three audits that cannot finish hand the batch over too.

Part 2, the surface:

- **S1, `/dev-change` folds into `/dev-spec`.** One entry writes the spec or the change brief: `/dev-spec <code>
  bug|refactor|perf` is a change, and the model's route of a request continues in the same call. The two rule
  sets stay in the domain. `/dev-change` stays as an alias of `/dev-spec`.
- **S2, `/dev-implement` and `/dev-verify` fold into `/dev-batches`.** One parser reads three shapes: no batch, the
  run of a plan (`--pr`, `--concurrency`); `<code> F<n>`, one batch (`--close`, `--pr`, `— correction: <finding>`);
  `<code> F<n> --audit [fast|full|resume] [--gate-only]`, the audit of one batch. `/dev-implement` and `/dev-verify`
  stay as aliases; under an alias the line reads as the command it names (`/dev-verify F2` is an audit). The next
  steps a verdict prints (`→ /dev-batches <code> F<n> — correction: <finding>`, `→ /dev-batches <code> F<n>
  --close`) are built and read back by one domain module, `src/shared/domain/dev/verdict-format.ts`, so the printer
  and the chains cannot drift. The crews `dev-change`, `dev-implement` and `dev-verify` stay: only their commands go.
- **S3, the surface follows.** 55 slash commands instead of 58, the folded names listed as aliases in
  `tests/repository/command-surface.fixtures.ts`, the command reference regenerated, the documentation and the texts
  a model reads naming the new forms.

## Consequences

- One driver runs every batch: a batch typed alone, a batch of a plan and its audit share one parser, one set of
  defaults (the push at the plan's close) and one completion hook, which tells the chains apart by the kind it
  recorded in the session at the dispatch (`dev_batches_chain`).
- The workflow has five commands: `/dev-spec`, `/dev-plan`, `/dev-batches`, `/dev-status`, `/dev-learn`.
- The three old names are kept as aliases for one release, then removed; a line typed under one keeps working, and
  what Orkeon Code prints names the new form only.
- The harness skills keep their eight names: a `/dev-implement` or `/dev-verify` a skill hands over still reaches
  `/dev-batches` through its alias.
- An audit cannot start while a plan runs: `/dev-batches` runs one at a time, its audit included.
- An unattended run now stops only where a human is needed: a review that cannot run, a Blocking question, a third
  GAPS round.

## Round 2: 55 → 48

Seven more commands fold into others, on the same mechanism (`aliases` on the surviving command, the typed name read
from the line, the routing in its use case under `src/commands/_lib/<group>/`):

- `/security-review` into `/review`: the line forces the security lens whatever `--lens` says;
- `/passes` into `/review`: `/review --passes <1-5>` sets one run's rounds, the crew input outranking the session's
  count; `/passes [n]` still shows or sets that count, without starting a review;
- `/plan` into `/mode`: the line toggles plan mode, as before;
- `/feedback` into `/memory`: a `feedback` memory, as before;
- `/memory-admit` into `/memory admit`: the list, a refusal and the import answered by the command, an admission
  written by the crew `shared-memory-admit`;
- `/stats` and `/cost` into `/usage`, which shows their rows whole: its one row gains the estimated tokens and the
  cache ratio only `/stats` had.

The reason is the one of part 2: each was a duplicate of an option or a sub-verb of another command, one more name to
learn for nothing the other did not do. The seven names stay as aliases, so a line typed under one keeps working.

An alias does not share a quota with its command: the one-at-a-time is the crew's, not the command's. A command
quota (`maxConcurrent: 1`) counts every line typed under any of the names, so it would refuse `/passes [n]` while a
review runs and `/memory list|add|get|delete` or `/feedback` while an admission's crew writes. `/review` and `/memory`
have none; before launching their crew they ask the host's `commands` service which instances of it run (the port
`RunningCrews`) and refuse the line with that ticket when one does: a second review (`/review` or
`/security-review`, the same crew) or a second admission (refused before its questions). Every other line goes
through. The check holds within one REPL, like the lock on the memory collection.

Left as they are: `/context` (the window by kind, not the session's account), `/init-verifiers`, `/transcribe`,
`/release-notes`, and the thin git and file accesses (`/diff`, `/branch`, `/files`), each the one
command of what it does.
