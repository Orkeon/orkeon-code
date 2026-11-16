# ADR 0032: The acts of the dev crews carry the pruning of their tool loop

- **Status**: accepted
- **Date**: 2026-11-16
- **Builds on**: [ADR 0027](0027-decision-model-optimisations.md), [ADR 0029](0029-orkeon-after-333.md)

## Context

[ADR 0027](0027-decision-model-optimisations.md) gave the main loop's act the pruning of its tool loop
(`compaction.prune`): past 40 % of the context window, the host's decision model judges the older results of the
read tools. The dev crews did not have it, and their acts are the longest of the product: the test author of
`/dev-implement` has 40 tool-call turns, its implementer 60, a reviewer 20.

Two facts shaped the change:

- The reviewer and the auditor act in a child agent. The parent hands the child its request as JSON, and a callback
  does not cross that hand-over.
- The use cases that make these acts (`runSubAgent`, the roles of `/dev-implement`) know nothing of the pruning, and
  a dev command must run as before on a host without a decision model.

## Decision

- **The pruning comes with the Llm, not with the request.** `prunedLlm`
  (`shared/application/compaction/pruned-llm.ts`) dresses an Llm: each act asks `contextPruning` for a binding on
  its own prompt and sends it with the request. No use case changes its signature.
- **It is bound where the act runs.** The body of a child agent dresses its own Llm (`childAgentBody`), so a
  reviewer or an auditor run as a child binds the pruning itself. The roles of `/dev-implement`, the inline audit
  of a batch agent and the reviewer of the next batch of `/dev-batches` have theirs dressed by the entry point's
  wiring.
- **One setting.** The acts of the dev crews follow `compaction.prune`, with the thresholds of the main loop. A
  second setting would say the same thing twice.
- **Nothing is added when nothing prunes.** With the setting off or unreadable, without a decision model, or when
  the binding cannot be made, the act receives the request object it was given, untouched. A request that already
  carries a callback is left alone. An extraction and a completion carry no binding.

## Consequences

- With the setting off, the default, a dev command sends the same requests as before: the tests that existed
  before this change pass without one of them modified.
- With the setting on and no decision model, each act logs the warning the main loop already logs, and runs as
  before.
- The window read is the session's. An act routed to another profile ([ADR 0029](0029-orkeon-after-333.md)) is
  pruned against the session's window, not its own model's.
- The reviewer of `/dev-spec`, `/dev-change` and `/dev-plan` has sixteen look-ups: a result removed that it reads
  again costs one. Its context stayed under 49 000 tokens in the measures of 2026-11-15, under the lowest threshold
  (51 200), so the pruning is not expected to run there.
- Measured on 2026-11-16 with the pruning off: the roles of one small batch stayed under 10,200 tokens a call, the
  reviewers under 43,000. No dev act reached the threshold, so what the pruning saves there, and what it costs in
  results read again, is not established ([decision models](../decision-models.md#measured-the-acts-of-the-dev-crews)).
