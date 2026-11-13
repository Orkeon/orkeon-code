# ADR 0030: Orkeon main after #356, the findings of the release validation fixed in the runtime

- **Status**: accepted
- **Date**: 2026-11-13
- **Builds on**: [ADR 0013](0013-pin-on-orkeon-commit.md), [ADR 0029](0029-orkeon-after-333.md)

## Context

The validation before the next tag ran the live session on GLM-5.3 (Z.AI) at the pin `41f5079`, the 1.0.0 release.
Four of its findings came from the runtime, and this project opened them on Orkeon:

- **#351**: `grep` refused a file as its `path`; the model then fell back on `file_read`.
- **#352**: the question of a crew run in the background showed in its task's thread only, while the answer went to
  the main field. A stray `1` typed there later went to the assistant as a new turn.
- **#353**: an `extract` reply that was empty or did not parse gave neither the finish reason nor the tokens spent,
  so a reasoning model that had used up `MaxTokens` read as a malformed answer.
- **#354**: GLM-5.3 refuses the effort `medium` (HTTP 400, code 1210), and that error reached `extract` as an empty
  reply.

Orkeon fixed the first four in one merge (`adae4dd`), then #356 (`cf56fae`, merged on `main` on 2026-11-13) made
thinking and effort depend on the model on every provider, from one capability table.

## Decision

- **The pin moves to `cf56fae`** (the full hash in `.orkeon-version`), the newest merge commit of Orkeon `main`; the
  status meta, the issue template, the guides. The esbuild of the runtime (`0.25.12`) and its .NET SDK (`10.0.300`)
  do not change. The typings from `scripts/sync-typings.sh` change in comments only: the effort levels per provider,
  the `<undefined-llm:…>` marker a failed `chat` gives, `grep` on a file.
- **`errorText` keeps 800 characters**, where it kept 400. The `extract` error of #353 gives the facts, then the
  first and the last 200 characters of the reply: at 400 the end of a reply cut short was lost, for the person and
  for the second try.
- **Nothing else changes in the code.** The adapter already throws on the `<undefined-llm:…>` marker of a `chat`
  (`llm-failure.ts`); a question asked from the background (#352) and `grep` on a file (#351) need nothing of this
  project.
- **The configuration guide says what GLM-5.3 takes**: `low`, `high` and `max`; the runtime sends a `medium` as
  `low` with a warning. It lists the new `Thinking` field of `Llm:ModelCapabilities` and its `<provider>/<model id>`
  form.

## Consequences

- The tool mode (the 1.0.0 package and archives) and the docker mode (the 1.0.0 image) are behind the pin until
  Orkeon's next release: on them `grep` refuses a file, a background question hides in its task, an `extract` error
  gives no reason, and `medium` on GLM-5.3 fails every call. `/status` says that the runtime is not the pin.
- Since #356, an effort a model does not take is lowered with a warning, where it used to be left out; thinking
  asked of a model that does not reason, or turned off on one that always does, is dropped with a warning. A
  setting of this project that asks for an effort (`/effort`, a crew's `effort`) now reaches the model lowered.
- A refused answer quoted to the model on the second try of `/dev-plan`, `/dev-change`, `/dev-learn` or a sub-agent
  can be twice as long.
- Checks at `cf56fae`: `npm run check` green; in source mode, `bash scripts/smoke-runtime.sh`: 50 commands loaded,
  0 skipped, 0 conflicts; `bash scripts/smoke-crew.sh` commits the mock's subject; `bash scripts/smoke-validate.sh`:
  18 crews, 0 failed. The fixes of #351-#356 were not run against a live host yet.
