# ADR 0035: Orkeon main after #483, the `browser` tool in place of `firefox`, the chat family at hand

- **Status**: accepted
- **Date**: 2026-11-25
- **Builds on**: [ADR 0013](0013-pin-on-orkeon-commit.md), [ADR 0019](0019-orkeon-after-293.md),
  [ADR 0021](0021-orkeon-after-298.md), [ADR 0033](0033-orkeon-after-447.md)

## Context

The pin moves from `0389fd2`, the commit of Orkeon `1.4.0`, to Orkeon `main` `bbfc06c`, three merges later:

- **#480**, issue #446 (ADR-021 of Orkeon): ten `chat_*` tools, named after the function, Microsoft Teams as the
  first provider. Six read (`chat_accounts`, `chat_list`, `chat_read`, `chat_search`, `chat_members`,
  `chat_meetings`), four declare an execute (`chat_send`, `chat_edit`, `chat_delete`, `chat_react`). The operator
  declares the accounts, their rights and the places they may read and post in under `Orkeon:Tools:Chat`; an
  account signs in as a user (`orkeon chat login`), as an application that only reads, or posts through a webhook.
  Orkeon states that the family was never run on a real Microsoft 365 tenant. The same merge adds a Teams channel
  to `orkeon-host`, which this project does not run.
- **#481**, issues #440 to #444 (ADR-022 of Orkeon): the tool `firefox` becomes `browser`, with the same actions
  and arguments, over an engine the host picks (`Orkeon:Tools:Browser:Engine`: Firefox by default, Chrome, Edge,
  Brave, Safari). Every answer carries `engine`. `firefox` and `Orkeon:Tools:Firefox` stay for one major as a
  deprecated second name.
- **#483**, issue #482, opened from this project: `orkeon-repl` mounts the credentials root and keeps the OAuth
  tokens of the e-mail, drive and chat accounts, as a runner does. Before it, a chat account that signs in as a
  user was refused in a session, since the session is the REPL.

The last release is `1.4.0`: the tool and docker modes run a runtime that has `firefox`, no `browser` and no chat
tool.

## Decision

- **`browser` alone.** The catalogue (`NETWORK_READ_TOOLS`), the access by action (`BROWSER_READ_ACTIONS`), the
  arguments a rule may name, the bridge example and the documentation name `browser` and never `firefox`. This
  project keeps no compatibility with an older runtime while it is in development: only the pin counts. A session
  on `1.4.0` (tool or docker mode) therefore has no browser tool until Orkeon's next release; an act that names a
  tool the host does not register fails, which is what a runtime behind the pin has always meant here.
- **The classes do not move.** `browser` reads for the nine actions that only look and executes for the others,
  its `screenshot` included; it stays a network tool, out of `plan` and `dontAsk`.
- **The engine is the host's.** Nothing in this project chooses or names an engine: the settings do, on the
  machine the browser runs on (the bridge's own settings in docker mode).
- **The chat family is not offered yet.** The ten names are registered by the runtime at the pin and reachable
  through `tools.extra`. Which enter the catalogue, in which modes and on what condition is the next change's, with
  its own ADR.

## Consequences

- A permission rule or a bridge `Allow` that names `firefox` no longer matches anything this project offers: it is
  rewritten with `browser`.
- `/release-notes` no longer says the release is the runtime every mode runs: the pin is ahead of it.
- No live check of the chat tools is possible here: there is no Microsoft 365 tenant. What the next change can
  verify is the catalogue, the rules and `chat_accounts`, which makes no request.
