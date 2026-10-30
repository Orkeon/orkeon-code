# ADR 0013: the pin is a commit of Orkeon's main, never a release

- **Status**: accepted
- **Date**: 2026-10-29
- **Amends**: [ADR 0002](0002-orkeon-rc6.md), [ADR 0010](0010-orkeon-after-234.md), [ADR 0012](0012-orkeon-after-239.md)

## Context

Since ADR 0002, `.orkeon-version` pinned a released Orkeon version, `1.0.0-rc.6`, and every adaptation to Orkeon's
`main` (ADR 0004 to ADR 0012) validated the commands against a commit the release did not carry: the runtime smoke
built the REPL from the sources at `ORKEON_SOURCE_REF`, a second pin kept in the workflow; the typings were
regenerated from that commit; the docs said in five places that the `orkeon-runners:1.0.0-rc.6` image was not
published yet; and ADR 0010 added a guard test so that no source called `decision` or `when`, two members the
typings carried and the pinned release did not ship.

The owner decided on 2026-10-29 that the source checkout is the reference runtime: Orkeon Code runs against
Orkeon's sources at one commit, and a release tag is never what it is checked against. The decision model of
Orkeon #234 (`decision`, `when`, `system_one_decide`) is the first thing the guard kept out for the sake of a
release that nobody runs here.

## Decision

- **`.orkeon-version` holds one full commit of Orkeon's `main`**, `3fcfbbe8fefe03da56b166ed679a76ac450d7c7a` today
  (main after Orkeon #240). `tests/repository/version.test.ts` checks the form (forty hexadecimal characters) and
  that `ORKEON_RUNTIME_COMMIT` of `src/commands/_lib/status/meta.ts` is the same commit. The launcher, `/status`
  and `/doctor` print its first seven characters, `3fcfbbe`.
- **The source mode is the reference runtime.** The launcher runs the checkout `ORKEON_SOURCE` names and warns when
  its `HEAD` is not the pin, without refusing. The runtime smoke checks Orkeon's sources out at the pin read from
  `.orkeon-version` and runs the source mode, always: `ORKEON_SOURCE_REF` is gone, one pin instead of two.
- **`/status` and `/doctor` compare commits, never versions.** The host's `runtime` service (Orkeon #225) carries the
  commit the build was made from; the row says `the pin of .orkeon-version` when that commit is the pinned one, short
  or full, and `NOT the pin 3fcfbbe of .orkeon-version` otherwise, a runtime that reports no commit included. A
  release built at the pinned commit is the pin, whatever its version says.
- **The tool and docker modes run a release, which the pin never names.** They stay as install conveniences:
  `orkeon-repl` from the Debian package, a release archive or the dotnet tool (`1.0.0-rc.6`), and the
  `orkeon-runners:latest` image (the last one published, `1.0.0-rc.5` at this writing; or the one `ORKEON_CODE_IMAGE`
  names) in docker mode and in `scripts/run-crew.sh`. The releases need not be at the same version: a mode runs what
  its channel published. `/status` says they are not the pin. `.config/dotnet-tools.json` keeps the last release for the typings' fallback and is no longer tied to the pin.
- **The typings come from the pin.** `scripts/sync-typings.sh` with `ORKEON_SOURCE` refuses a checkout at another
  commit (`--any` overrides); without a checkout it generates the typings of the manifest's release and says so.
- **The guard on unshipped members goes.** The sources may call whatever the pinned commit ships: `decision` and
  `when` among them. What ADR 0010 kept out of the sources for the release's sake is allowed, and the opt-in path of
  `system_one_decide` through `tools.extra` stands as it is.

## Consequences

- Upgrading Orkeon is one commit moved in `.orkeon-version` and `meta.ts`, the typings regenerated from a checkout at
  that commit, `esbuild` and `global.json` aligned with what the commit bundles with and pins, then `npm run check`
  and the smoke in source mode ([Development](../development.md), "Upgrading Orkeon").
- A user of the tool or docker mode runs an Orkeon behind the pin: what the pinned commit added since the last
  release (an exclusive crew launch, the decision tasks) is ignored or fails there, and `/status` names the
  difference. The reference path for a user is a checkout of Orkeon at the pin.
- The ADRs before this one keep their text: they name the release they were written against.

## Alternatives considered

- **Two pins, a release and a commit**, as before: the release was never what the commands were validated against,
  and every adaptation had to say so in the docs, the workflow and a guard test.
- **Renaming the file to `.orkeon-ref`**: the launchers, the install scripts, the issue template and a dozen pages
  name `.orkeon-version`; the content changes, the name stays, and a test keeps the content a commit.
- **Refusing the source mode at another commit**: a developer checks an Orkeon branch out to try a change; a warning
  names the pin and lets the run go.
- **Pinning the docker image to the pin's commit**: Orkeon publishes images on release tags only; the image can
  follow the last release or nothing.
