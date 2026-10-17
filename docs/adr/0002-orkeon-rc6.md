# ADR 0002: Orkeon 1.0.0-rc.6 only

- **Status**: accepted
- **Date**: 2026-10-16

## Context

Orkeon Code 0.1.0-alpha.1 ran on Orkeon `1.0.0-rc.5`, whose runtime left gaps the TypeScript had to work around or
document as limits:

- **#92**: `ctx.llm.act` called tools only on OpenAI-shaped answers, and a failed turn was not told apart from an
  answer; the REPL refused mounts outside its own directory, so the launcher moved to the deepest common parent of
  the project and the sources; the permission gate did not know `dontAsk`; the script cap was too low, so the
  launcher exported `MaxScripts=200`; and the version directive `/// <reference orkeon-script="1.0" />` is a TS1084
  error for `tsc`, so `scripts/typecheck.mjs` blanked it before checking.
- **#94**: the REPL could not ask the operator about a tool call: in `default` mode a write was refused.
- **#103**: `shell_command` did not ask for the write right on the paths a writing command names.
- **#104**: `orkeon-repl` did not place and guard its mounts like `orkeon run`.
- **#105**: the Debian package did not ship `orkeon-repl`; it needed a .NET SDK.
- **#106**: the gate read no session rules, so `/permissions` imitated allow and deny rules by trimming the tool
  catalogue when a crew starts; `runCrew` did not ask the operator either.
- **#107**: the REPL connected no MCP server and loaded no plugin, so the tool names were a closed list.
- **#108**: the `orkeon-runners` image was built for `linux/amd64` only.
- **#109**: the script typings were not published with a release.
- **#110**: `shell_command` had no confinement outside a container.

Orkeon `main` closes every one of them. It will be published as `1.0.0-rc.6`.

## Decision

- **Orkeon Code targets Orkeon `1.0.0-rc.6` only.** `.orkeon-version` and `.config/dotnet-tools.json` pin it, and
  `tests/version.test.ts` keeps them equal.
- **No rc.5 path.** No runtime version detection, no capability probe, no fallback: a workaround rc.5 needed is
  removed, not kept beside the runtime's own behaviour.
- **Typings from the sources.** The typings are generated from Orkeon `main`; `scripts/sync-typings.sh` reads an
  Orkeon checkout named by `ORKEON_SOURCE` before the tool manifest and the image.
- **The directive `tsc` accepts.** Every `.ork.ts` opens with `// @orkeon-script 1.0`, and `npm run typecheck` is a
  plain check of the project.

## Consequences

- Until `1.0.0-rc.6` is tagged and published, only the launcher's source mode runs Orkeon Code: `ORKEON_SOURCE`
  names an Orkeon checkout, built with `dotnet run`. The docker mode (the `orkeon-runners:1.0.0-rc.6` image) and the
  tool mode (`orkeon-repl`, `Orkeon.ConsoleApp` 1.0.0-rc.6, from the Debian package or the release archive) fail until
  then. `Orkeon.Scripting.Cli` is used only by `scripts/run-crew.sh` and `scripts/sync-typings.sh`.
- The CI runtime smoke (`.github/workflows/runtime-smoke.yml`), which pulls the image at the pinned tag, fails until
  the tag. That failure is expected; the README and the getting-started guide say so.
- Orkeon Code no longer runs on rc.5: an operator who cannot move stays on 0.1.0-alpha.1.
- The typings of `main` still name only `fileRead`, `fileWrite` and `directoryRead` among the tools this code calls;
  `src/shared/infrastructure/orkeon/runtime-tools.ts` keeps declaring the others.

## Alternatives considered

- **Support rc.5 and rc.6, with capability detection**: rejected by the maintainer. Every gap would keep two code
  paths, the workaround and the runtime's behaviour, each to test, for a pre-release runtime that rc.6 replaces.
- **Stay on rc.5 until rc.6 is published**: the workarounds imitate the runtime rather than use it (the catalogue
  standing in for the permission gate, the prose saying writes are refused), and every change made on them would be
  undone at the upgrade.
