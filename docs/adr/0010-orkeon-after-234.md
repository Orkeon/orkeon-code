# ADR 0010: Orkeon main after #234, on the rc.6 pin

- **Status**: accepted
- **Date**: 2026-10-29
- **Amends**: [ADR 0009](0009-orkeon-after-230.md)

## Context

Five Orkeon pull requests landed on `main` after #230, the commit ADR 0009 validated (`7ff12c9`); `b8833ca` is the
last of them:

- **#231, `1.0.0-rc.6` cut and the public API frozen**: `src/Directory.Build.props` moves from rc.5 to rc.6, the
  changelog closes the `[1.0.0-rc.6]` section (dated 2026-10-28) and every `PublicAPI.Unshipped.txt` is folded into
  its `Shipped.txt`. Nothing of the scripting surface Orkeon Code calls is renamed or removed: the freeze records
  what #224-#230 added.
- **#232, #233, release fixes**: the Debian smoke starts `orkeon-repl` with a mount, and `Dockerfile.runners` copies
  the root `Directory.Build.targets` it had left out. The tag `v1.0.0-rc.6` is on #232 (`14e1796`); the GitHub
  release of 2026-10-28 carries the archives (Linux x64 and arm64, macOS x64 and arm64, Windows `.zip` and `.msi`),
  the Debian packages and the SBOM, and `Orkeon.Scripting.Cli 1.0.0-rc.6` is on nuget.org. The
  `orkeon-runners:1.0.0-rc.6` image was not on ghcr.io on 2026-10-29 (the registry lists rc.3 to rc.5): the
  `Dockerfile.runners` fix of #233 came after the tag.
- **#234, the TypeSafe System One decision model** (Orkeon ADR-015 and ADR-016): `ModelProviderCategory`,
  `IDecisionModel` and the TypeSafe adapter, decision profiles with `route`, `guard` and `verify` stages, an input
  guard, the `decision` reranker, and a 120th tool class, `system_one_decide`, registered by `AddOrkeonTypeSafe`,
  which the three shipped binaries call only when the `Orkeon:TypeSafe` section exists or `TYPESAFE_API_KEY` is set.
  The scripting DSL gains `decision(spec)` and `when(decisionTask, clauses)` on the task builder, run by the
  Sequential, Parallel and Graph processes; the settings gain the `Orkeon:TypeSafe` and `Orkeon:Decision` sections
  and `orkeon run` the `--no-decision` flag. Marked breaking by Orkeon: `TaskCompletedEvent.AgentId` is nullable
  and `ParallelProcessStrategy` takes `CrewStrategyDependencies`, C# surfaces Orkeon Code never touches.
- **#235, the rate-limit window reads `retry-after-ms`**: beside `Retry-After`, the header OpenAI and TypeSafe
  send in milliseconds; the longest header still wins and `Llm:MaxRateLimitWait` still bounds the wait.

What Orkeon Code calls is unchanged: the regenerated typings differ by the two task-builder members and their
types (`DecisionSpec`, `QuestionSpec`, `WhenClauses`) in `orkeon.d.ts`; `orkeon-cli.d.ts` is identical. The crews
of Orkeon Code are procedural (`publishCrew`, agents acting over a tool catalogue) and build no task DAG, so
nothing of them can call the two members; `OrkeonBuiltInTools` does not list `system_one_decide`, an opt-in tool.

## Decision

- **The same pin, now a release.** `.orkeon-version` stays `1.0.0-rc.6`, which is tagged: the surface Orkeon Code
  targets is a published release for the first time since ADR 0002, and the ADRs 0004 to 0009 are in it. The
  typings are regenerated from `b8833ca` (`scripts/sync-typings.sh` over `ORKEON_SOURCE`), the runtime smoke builds
  that commit while the rc.6 image is unpublished and switches to the image by itself once `docker manifest
  inspect` finds it, as the workflow already decides. The documentation stops saying that only the source mode
  works: the tool mode has its packages (the Debian package on the apt `rc` channel, the release archives, the
  dotnet tool), the docker mode waits for the image.
- **The two unshipped members are kept out of the sources.** The typings describe `main` after #234, two members
  ahead of the release the pin names: a call to `.decision(` or `.when(` would typecheck and fail on the pinned
  runtime. `tests/repository/version.test.ts` keeps every runtime source of `src/` free of such a call, until the
  pin moves to a release that ships them.
- **`system_one_decide` is in no built-in list.** The catalogue names only tools the host registers, since an
  unknown name in `.tools([...])` fails the act before the model is asked, and `orkeon-repl` registers this one
  only with the `Orkeon:TypeSafe` section or `TYPESAFE_API_KEY`. A user whose host registers it lists it in
  `tools.extra`, where it is accepted as it is no built-in; it declares a read to the gate, so it runs without a
  question wherever the catalogue offers it, and the `write` class it takes by default keeps it out of `plan` and
  `dontAsk`, which promise that nothing leaves the machine: the tool sends the state it is given to the TypeSafe
  API. `permission.test.ts` pins that no mode offers it by itself, `extra-tools.test.ts` that the listing is
  accepted. Orkeon Code reads neither `Orkeon:TypeSafe` nor `Orkeon:Decision`: its agents run on the `Llm`
  section and the host's profiles, as before.
- **The rate-limit row names the new header.** `Llm:MaxRateLimitWait` in the configuration page says the window
  comes from `Retry-After`, `retry-after-ms` or the provider's reset headers, the longest winning. Nothing of
  Orkeon Code reads the headers.
- **The roadmap is unchanged.** None of #231-#235 closes an item or a known issue of the roadmap; the pages that
  said "until rc.6 is tagged" (README, CONTRIBUTING, getting started, development, headless, the WSL tutorial, EN
  and FR) say what is published and what is not.

## Consequences

- `orkeon-code` runs from an `orkeon-repl` of the release (`--mode tool`), the first mode the launcher picks when it
  finds one on `PATH`; `--mode docker` and the smoke's image path wait for `ghcr.io/orkeon/orkeon-runners:1.0.0-rc.6`.
  Neither the tool mode on the release's packages nor the Windows launcher on the `.zip` or `.msi` was run live for
  this ADR: the runtime smoke on `b8833ca`, in source mode, is the check made.
- `/status` on a build of `main` after #231 says `Orkeon 1.0.0-rc.6+<sha> (source), the pin of .orkeon-version`;
  on the release's `orkeon-repl` it says the same version with its own commit and channel.
- A crew of Orkeon Code that one day branches on a decision task needs the pin on a release that ships `decision`
  and `when`, and the `Orkeon:TypeSafe` section in the settings; the test of `version.test.ts` is then updated with
  the pin.
- A user who sets `Orkeon:TypeSafe` can hand `system_one_decide` to the assistant with
  `/config set tools.extra system_one_decide` ([Permissions](../permissions.md#extra-tools)); no example settings
  file sets the section.

## Alternatives considered

- **Pinning `.orkeon-version` to a `main` build identifier**: the pin is a version the launcher checks and the
  image tag; `main` after #234 reports `1.0.0-rc.6`, like the release, so the pin stays and the ADR names the commit.
- **Adding `system_one_decide` to `NETWORK_READ_TOOLS`**: offered by name, it would fail every act of a host without
  the TypeSafe section, the common case; the extra-tools path exists for a tool the host may or may not register.
- **Regenerating the typings from the `v1.0.0-rc.6` tag** instead of `b8833ca`: the typings would match the pin
  exactly, but the smoke and the ADRs validate Orkeon Code against `main`, and the two extra members are guarded by
  a test rather than hidden from the type check.
- **Mirroring `decision` and `when` in the crews**: Orkeon Code's crews are act loops, not task DAGs; a decision task
  has no place in them today, and the rc.6 runtime they target does not run one.
