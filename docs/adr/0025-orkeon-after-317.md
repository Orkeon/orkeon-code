# ADR 0025: Orkeon main after #317, `orkeon run --validate` on every crew

- **Status**: accepted
- **Date**: 2026-11-09
- **Amends**: [ADR 0024](0024-orkeon-after-299.md)

## Context

ADR 0024 set `orkeon run --validate` aside. At `1a10f97` it loaded every `.ork.ts` through the declarative crew loader
and refused what `orkeon run` executes: `git-commit` ("At least one task is required", a crew whose work is its agents'
bodies) and `main-loop` (`budget.contextTokens`, which the REPL accepts). With the type check on, a crew's
`/// <reference path="../.orkeon/orkeon.d.ts" />` beside the runtime's `/typecheck/orkeon.d.ts` declared every
identifier twice (TS6200). This project opened Orkeon #315 (the typings) and #316 (the loader) on 2026-11-09.

Orkeon #317 (`7a4ef3d`), merged on `main` the same day, closes both. `--validate` routes a `.ork.ts` as `run` does: a
script whose source never assigns `globalThis.crew` runs on the scripting host, so it is checked up to its bundle (the
version directive, the types, esbuild) and never run; the declarative loader judges only a script that assigns
`globalThis.crew` in its own source. A copy of the typings identical to the embedded roll-up stands in for the
runtime's; a stale copy fails with one line that says to run `orkeon typings`. Between the two pins Orkeon `main` also
took four dependency bumps of its workflows (#310 to #313) and a documentation change (#314): nothing under the
typings changes.

Every crew of this project ends with `publishCrew(crew)`, a helper that assigns `globalThis.crew`: the runtime reads
none of these sources as declarative, so each one is a procedural script to `--validate`.

## Decision

- **The pin moves to `7a4ef3d`** (`7a4ef3d1805ad0f6c6a2ce3a101d334b5507f97e`), a merge commit of Orkeon `main`
  (ADR 0013); `.orkeon-version`, the status meta, the issue template, the guides. `scripts/sync-typings.sh` at this
  commit changes nothing under `src/crews/.orkeon` and `src/commands/.orkeon`.
- **`orkeon run --validate` is adopted on every crew**, as the smoke `scripts/smoke-validate.sh`: each
  `src/crews/<name>/crew.ork.ts` (a `_` probe left out) is validated through `scripts/run-crew.sh` with the example
  settings made keyless, as the other smokes do. Every crew is judged; the smoke names each one that exited other than
  `0` or ended without its `VALIDATION OK` line, and fails with them. `runtime-smoke.yml` runs it after the crew smoke,
  on the same triggers plus the script itself; `npm run check` stays Node-only. `tests/scripts/smoke-validate.test.ts`
  drives the script over a fake runner.
- **The type check stays on**: the runtime's `tsc` accepted every crew's shape at `7a4ef3d`, so no `TypeCheck: Off`.
- **The crews keep their `/// <reference>`** to `src/crews/.orkeon/orkeon.d.ts`: the copy is the one
  `scripts/sync-typings.sh` writes from the pin, which the runtime now accepts; a pin bump that changes the typings
  without the sync fails the smoke with the runtime's one line.

## Consequences

- A crew whose source stops type-checking against the runtime's typings, or whose bundle breaks, fails the runtime
  smoke before any model is involved; `npm run typecheck` keeps judging the same files over this project's copy of the
  typings, so the two can disagree only when the copy is stale.
- Of what ADR 0024 set aside, only `--validate` moves; the rest of its table holds.
- Checks at `7a4ef3d`: `npm run check` green; `bash scripts/smoke-runtime.sh --mode source`: 49 commands loaded, 0
  skipped, 0 conflicts; `bash scripts/smoke-crew.sh` in source mode commits the mock's subject; `bash
  scripts/smoke-validate.sh` in source mode: 18 crews `VALIDATION OK (procedural script: bundled, not run)`. A copy of
  `git-commit` with a `string` assigned to a `number` fails with `VALIDATION FAILED: type errors` and the `TS2322` line.
