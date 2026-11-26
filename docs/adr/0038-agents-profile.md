# ADR 0038: `agents.profile`, the agents on another profile than the main turn

- **Status**: accepted
- **Date**: 2026-11-26
- **Builds on**: [ADR 0027](0027-decision-model-optimisations.md), [ADR 0034](0034-orkeon-after-470.md)

## Context

One session key, `llm.profile`, names the host profile every agent runs on: the main loop's turn, the explorer it
spawns, and every crew a command launches, child agents included. `/model` changes the model of the turns on their
provider and reaches nothing else. A session could therefore not hold its conversation on one provider and its
agents on another: the case asked for is the conversation on an API key and the agents on a Claude subscription,
through the `agent-cli` provider.

## Decision

- **A second session key, `agents.profile`.** It names the host profile of every agent but the main turn's, with
  the names `llm.profile` takes. Omitted, the agents follow `llm.profile`: nothing changes for a session that does
  not set it.
- **Who it moves.** Every crew a command launches other than the main loop (`withLlmProfile` reads `agents.profile`,
  else `llm.profile`), and the explorer the main turn spawns: the main loop's input carries the key as
  `agentsLlmProfile`, and the crew's entry point builds the explorer on it. The turn itself is built on
  `llm.profile` alone.
- **One rule, no list of crews.** `/compact`, `/advisor` and the speech crew move with the others. A key per crew
  would be a second routing; `/route` already picks a profile per launch.
- **Routing.** The profile a crew is launched on is the routing's ceiling and fallback, as the session's profile
  was: under `agents.profile` that profile is the agents'. A profile outside the ladder is still not routed.
- **`/effort`.** The second line that judged the host's own model under a `/model` override now judges what the
  dev steps and the sub-agents run on, and names it: the host's model, or the agents' profile.
- **A wrong name.** A value that is no profile name is warned about at each launch and the agents follow
  `llm.profile`. A name the host does not declare fails the crew's load as `llm.profile` does, or the turn that
  spawns the explorer.

## Consequences

- With the `agent-cli` example, `/config set agents.profile subscription` and no `llm.profile`: the turns run on
  the default profile, on the key; the explorer and the crews on the CLI, with the fallback the profile declares.
- The host's own services (planner, Guardian, judges) stay on the default profile, as before.
- A crew input still carries one profile, `llmProfile`: no crew but the main loop knows the key exists.
- The log line of a profile outside the ladder no longer says `the session's llm.profile`: the profile may come
  from either key.
