# ADR 0003: Prompts written from a behaviour specification

- **Status**: accepted
- **Date**: 2026-10-17

## Context

Orkeon Code's prompts were in two states before the first release.

- **Borrowed.** The behaviour blocks of the main loop and the structure of the compaction prompt had been adapted
  from another product's published prompts. CONTRIBUTING ("Original work only") forbids it, and
  `scripts/provenance-baseline.json` listed the files, which kept the strict provenance gate, and so a release,
  closed.
- **Thin.** The crew prompts were one to four sentences. The main loop's header said nothing about checking a change,
  care with destructive actions, git, secrets, the trust to give to file contents and tool output, or the limits of
  the tools it lists.
- **Wrong in places.** Every turn sent the request twice (the history ended with it, then the task repeated it); a
  long transcript was cut at its head, so the summary lost the recent work; the pressure tiers never reached the
  model although the documentation said they did; `/commit` asked for a message about changes whose untracked files
  the model never saw; the hooks block showed the model ticket codes.

## Decision

- **Behaviour first.** `docs/architecture.md`, "Prompt assembly", specifies what each prompt must produce, rule by
  rule. The text is written from that specification, in this project's own words. Published agent prompts and the
  documentation of other assistants are read to learn which behaviours matter, never as text to reuse.
- **Pin the behaviour.** Every rule has a marker phrase a test pins. `tests/prompt-contract.test.ts` renders every
  prompt in every permission mode and checks the markers, that the main loop's header is digit-free, identical from
  one turn to the next and under `MAX_STATIC_HEADER_CHARS`, and that no rendered prompt carries a provenance marker.
- **Read the change as the model will.** `node scripts/render-prompts.mjs <dir>` writes every prompt as it is sent;
  a prompt change is reviewed as the diff of two renders, then in a live session on the demo fixture before a
  release.
- **Tell the model what the runtime does.** The header states the runtime's real limits: tool calls run one after the
  other, a long result is cut, `file_read` has no start position, the shell runs an allow-list. What only the
  runtime can fix (tool descriptions, a start position for file_read, parallel calls) is asked of Orkeon, not papered
  in the prompt.
- **The gate stays strict.** The provenance baseline is empty, and CI runs `npm run check:provenance -- --strict`, so
  a borrowed text cannot come back unnoticed.

## Consequences

- The header grows from about 1 400 to about 2 200 tokens (5 566 to 8 985 characters in the writing modes, under the
  9 000-character ceiling). It stays identical per mode, so a provider's prefix cache pays for it once per session.
- A prompt change is a specification change first: a review reads the specification, the pinned markers and the
  rendered diff.
- A behaviour the tests cannot see (does the model actually run the tests, refuse a planted instruction, resume from a
  summary?) is checked by a scripted live session; it needs a provider key, so it runs before a release, not in CI.
