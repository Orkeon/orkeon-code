# Recipes

The steps of the common changes to Orkeon Code, each with the files to touch and the checks that must stay green.
The layers and the rule between them are in [Architecture](architecture.md); what each extension point is for, in
[Extending](extending.md).

## Add a command

1. Write `src/commands/<group>/<name>.cmd.ts` after the pattern above, `<group>` the functional folder it belongs to: one `name: "<literal>"` in kebab case, a static
   `description`, no top-level `export`.
2. Put the logic worth testing in `src/commands/_lib/<group>/<name>.ts`, the same `<group>` as the command, as
   `run<Name>(tokens, deps)` returning a `CommandView`, its deps a `Pick<>` of the ports and services it reads; test
   it in `tests/commands/_lib/<group>/<name>.test.ts`, over the fakes. A helper that several groups share
   sits at the root of `_lib/`; a group never imports another one.
3. Raise `EXPECTED_COMMAND_COUNT` in `tests/repository/command-surface.test.ts` and the command count of `RELEASE_NOTES` in
   `src/commands/_lib/status/messages.ts` (pinned by `tests/commands/_lib/status/messages.test.ts`), then run `npm run docs:commands`.

## Add a crew

1. Create `src/crews/<name>/crew.ork.ts` after the pattern above: the two header lines (`// @orkeon-script 1.0`, then
   the reference to `../.orkeon/orkeon.d.ts`), the agents with the tool names they need, `publishCrew(...)`.
2. Put the use case in `application/run-<name>.ts` (`run<Name>(input, deps)`), its pure rules in `domain/`, each with
   its `*.test.ts`; the use case test runs over the fakes.
3. Start it from an async command (`launchCrew({ crews: createCrewHost(ctx.services), log: ctx.log }, "<name>",
   input)`), and name it in `RELEASE_NOTES`
   (`tests/commands/_lib/status/messages.test.ts` checks that every crew folder is named there). A folder starting with `_` is a
   development probe (`probe.ork.ts`), never listed to users.

## Add a tool

1. Check the name the runtime registers (`/debug-tool-call list`): an unknown name in `.tools([...])` fails every
   `act` call of the agent. A tool of an MCP server or a plugin needs no code: the user lists it in `tools.extra`
   (`shared/domain/agent-policy/extra-tools.ts`), and the launching command offers it if the host registers it.
2. For the main loop, add it to its class in `src/shared/domain/agent-policy/permission.ts` (`READ_TOOLS`,
   `NETWORK_READ_TOOLS`, or the edit and shell classes): the mode-policy table decides which modes hand it to the
   model. Update `permission.test.ts`, and `docs/permissions.md` when a mode's surface changes. Another crew names
   it in its own `.tools([...])`.
3. When application code calls the tool itself, it goes through a port: its input and result are typed by the
   generated typings (`crews/.orkeon/orkeon.d.ts`, `OrkeonTools`; `orkeon/runtime-tools.ts` keeps a stricter local
   shape only when the adapter wants one), add the call to an adapter (or a new port, below) that reads the result
   through `tool-results.ts`, test the adapter over `FakeTools`.

## Add a permission mode

A mode is stated once: an entry of `PERMISSION_MODES` (`src/shared/domain/permission-modes.ts`, and `MODE_CYCLE`
when bare `/mode` should cycle through it on a console without panels) and a row of `MODE_POLICIES`
(`src/shared/domain/agent-policy/mode-policy.ts`):

| Mode | `readOnly` | `toolClasses` |
|---|---|---|
| `default` | no | read, network, edit, shell, extra |
| `acceptEdits` | no | read, network, edit, shell, extra |
| `bypassPermissions` | no | read, network, edit, shell, extra |
| `plan` | yes | read |
| `dontAsk` | yes | read |

`extra` is the extra tools of class `write`; an extra tool of class `read` joins `read`. `MODE_POLICIES` is typed by
the mode list, so the type check refuses a mode without its row. The main-loop
catalogue and its permission note, the refusal of `/commit` in a read-only mode and `/mode`'s announcement read the
row; `/mode` and the allowed values of `permissions.fallback` read the list. The host's permission gate must know
the mode too (Orkeon classifies an unknown mode fail-closed). Update `mode-policy.test.ts` and
`docs/permissions.md`.

## Add a prompt block

1. Write its renderer in `src/crews/main-loop/domain/prompt-assembly.ts` (`build<Name>Block`), returning an empty
   string when there is nothing to say, so a session that does not use it keeps a byte-identical prompt.
2. Give it a field of `ContextParts` and its place in `assembleContext`'s fixed order; a block of the static header
   must hold no per-turn data, or the provider's cache breaks.
3. Read its input in `application/context-gather.ts` (through the ports) and pass it in `application/prompts.ts`;
   test the renderer in `prompt-assembly.test.ts` and the turn over the fakes.
4. Specify the behaviour first, in "Prompt assembly" above, then write the text from it in this project's own words
   (CONTRIBUTING, "Original work only"); pin a marker phrase of each rule in the test, and run
   `node scripts/render-prompts.mjs` before and after to read the change as the model will.

## Add a config key

1. Declare it in `CONFIG_KEYS` (`src/shared/domain/config-schema.ts`): key, description, allowed values, the
   consumer. A key nothing reads must not be settable.
2. The consumer takes `Pick<ConfigStore, "readValue">` as a dependency (wired with `orkeonConfigStore()`) and reads
   `(await config.readValue(key)).value`, falling back to its default when the value is absent or unreadable.
3. `/config keys` lists it with its allowed values and the commands that read it, and `/config get` shows its
   description while it is unset; name it in `docs/configuration.md` ("Session settings") when users should know it.

## Add a port

1. Declare the interface in `src/shared/application/ports/<concern>.ts` (a new concern is a new file), named
   after the need, with its failure contract (which calls throw, which are best effort), and add its name to the
   `export type` line of that file in `ports.ts`, which every importer names.
2. Write the adapter `src/shared/infrastructure/orkeon/<port>.ts`: `create<Port>(runtimeObject)`, the tool inputs
   declared in `runtime-tools.ts`, the results read through `tool-results.ts`. Bind it in `wiring.ts` when it reads
   the `tools` global; otherwise the entry point builds it from its context.
3. Write `tests/support/doubles/fake-<port>.ts`, a class `Fake<Port>` implementing the port with plain fields to configure
   and inspect, and the adapter's test over the runtime stand-in.
4. A port lands with its first production caller, never ahead of it.
