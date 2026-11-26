# ADR 0037: Orkeon main after #486, nothing adopted, `chat_attach` left to the hosted conversations

- **Status**: accepted
- **Date**: 2026-11-26
- **Builds on**: [ADR 0013](0013-pin-on-orkeon-commit.md), [ADR 0035](0035-orkeon-after-483.md),
  [ADR 0036](0036-chat-tools.md)

## Context

The pin moves from `bbfc06c` to Orkeon `main` `948d1b6`, three merges later:

- **#484**: the tools a `.ork.ts` crew builds with `toolBuilder()` travel with the loaded crew and no longer enter
  the registry of the process. Before it, a second run of such a crew in one process, or two crews with a tool of
  the same name, failed on a name collision. This project builds `run_validation`, `run_tests` and `run_build`
  that way and attaches them with `withAutonomousTool`; it never looks one up in the registry.
- **#485**: `orkeon-host` gives a Discord or Teams conversation two folders, `/inbox` and `/outbox`
  (`Orkeon:Host:Files`, off by default), shows the images of a message to the crew (`CrewInput.Images`), lets a
  crew declare the folders it opens (`files:`), and registers an eleventh chat tool, `chat_attach`, which sends
  files of `/outbox` to the conversation the run answers. Outside such a conversation the call fails.
- **#486**: two fixes of Orkeon's own checks, and a Safari driver that never opened its session.

The typings gain `chatAttach` and nothing else. The last release is still `1.4.0`, six commits behind the pin.

## Decision

- **Nothing is adopted.** No source of this project changes but the pin and the typings.
- **`chat_attach` is not offered.** A session of Orkeon Code is the REPL, which answers no chat conversation: the
  tool could only fail there. The chat family of the catalogue stays the ten tools of ADR 0036. The day this
  project runs under `orkeon-host`, offering it is that change's decision.
- **The script tools stay as they are.** #484 removes a failure this project could meet (two runs of
  `/dev-implement` or `/dev-verify` in one process); the slot that refuses a second concurrent run of one crew
  (`script-tool-slot.ts`) guards this project's own state, not the registry, and stays.

## Consequences

- The check, the REPL smoke, the crew smoke under `--llm-mock` and the validate smoke of the eighteen crews pass in
  source mode at `948d1b6`. No turn with a real model was run for this pin, and none through a script tool.
- The tool and docker modes still run `1.4.0`: nothing of this pin reaches them, and nothing here depends on it.
