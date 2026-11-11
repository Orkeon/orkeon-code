# ADR 0028: The runtime of the pin, downloaded at the first start

- **Status**: accepted
- **Date**: 2026-11-11
- **Builds on**: [ADR 0013](0013-pin-on-orkeon-commit.md)

## Context

`npm install -g orkeon-code` and `install.sh` install Orkeon Code alone. The Orkeon runtime is a second install: the
`orkeon` package, a release archive, or Docker. On a machine with none of them the launcher stopped on
`no Orkeon runtime found`.

Orkeon publishes runnable archives per release only, and the pin is a commit of its `main` (ADR 0013): the archive
of a release is behind the pin on most days, and Orkeon Code keeps no fallback for an older runtime. An archive
runs from the folder it is extracted in: its `bin/orkeon-repl` finds `libexec/` and its own esbuild beside it.

## Decision

- **The package names its runtime.** `.orkeon-runtime`, shipped with the launchers, holds an id (the seven
  characters of the pin the archives were built from), the address of `orkeon-runtime-<id>-<platform>.tar.gz` and
  one SHA-256 per platform. The release workflow of Orkeon Code builds these archives from Orkeon at the pin and
  fills the file before it publishes. In a checkout the id is empty: nothing is downloaded, the source mode is its
  runtime.
- **The launcher downloads it when nothing else is found**: no `ORKEON_REPL`, no `orkeon-repl` on `PATH`, no Docker,
  no `ORKEON_SOURCE`, or `--mode tool` with no `orkeon-repl`. Docker keeps its place when present, so a setup that
  works does not change by itself.
- **It asks first.** One question on the terminal; without a terminal, exit 3 and the two ways to agree
  (`orkeon-code runtime install`, `ORKEON_CODE_RUNTIME_DOWNLOAD=1`). The question comes before any state is made.
- **The sum comes from the package**, not from a file fetched beside the archive: whoever can replace the archive
  can replace a `SHA256SUMS` next to it, not a file the package's own provenance covers. A mismatch deletes the
  download.
- **It lives in `~/.orkeon-code/runtime/<id>/`**, extracted beside it then renamed, so an interrupted download never
  looks installed. Nothing joins `PATH`: an `orkeon-repl` the user installs keeps coming first. Once downloaded, the
  runtime comes before Docker, since it is the pin and the image is not.
- **One runtime is kept**: installing the one of a newer package removes the others. `orkeon-code runtime remove`
  deletes the folder; uninstalling Orkeon Code leaves `~/.orkeon-code/` alone, as before.

## Consequences

- The launcher holds its own `sha256` and download lines rather than sharing those of `scripts/install.sh`: that
  script is published alone with each release and reads no file beside it.
- Until the release workflow builds the archives, `.orkeon-runtime` names nothing in any package and the behaviour
  is unchanged for every user.
- `orkeon-code.ps1` does not download a runtime yet. On Windows only Orkeon's full archive carries `orkeon-repl`
  (570 MB); the PowerShell twin waits for a smaller one.
- Set aside: an npm `postinstall` (scripts are often disabled, and the archive install would not gain it), and one
  npm package per platform (five packages to publish at every pin).
- Checks: `tests/scripts/launcher.runtime.test.ts` runs the launcher against a curl stand-in that serves a small
  archive from the disk: the download, the question, the refusal without a terminal, the wrong sum, the order with
  Docker and `orkeon-repl`, the two `runtime` commands, `--version`.
