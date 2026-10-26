# Extending Orkeon Code

Everything the agent says and does on the TypeScript side is a source file of this repository: a command is a file,
a crew is a folder, a prompt is a string with its test next to it, a permission mode is a row of a table. There is no
build step on your side: the runtime bundles the sources with esbuild and runs them in Jint when the REPL starts, so a
change is live at the next start. This page lists the extension points, what each one touches, and where the limits
are. The layers, the ports and the step-by-step recipes are in [Architecture](architecture.md#recipes); the coding
rules in [CONTRIBUTING.md](../CONTRIBUTING.md).

## A slash command

A file `src/commands/<group>/<name>.cmd.ts`, `<group>` one of the functional folders (`session`, `settings`, `status`,
`project`, `git`, `dev`, `memory`, `speech`). The loader picks every `*.cmd.ts` under the folder; the name is kebab-case and unique, and the
file exports nothing. A synchronous command answers at once with `defineCommand`; an asynchronous one starts a crew
with `defineAsyncCommand` and prints the result when the crew completes
([Architecture](architecture.md#from-a-command-to-a-crew)). A command reaches the runtime through the adapters of
`src/shared/infrastructure/orkeon/wiring.ts`, never through the globals:

```ts
/// <reference path="./.orkeon/orkeon-cli.d.ts" />
import { orkeonSessionIo } from "../shared/infrastructure/orkeon/wiring.ts";

const session = orkeonSessionIo();

defineCommand({
  name: "which-mode",
  description: "Say which permission mode the next request runs in, and why.",
  handler: async (_args, ctx) => {
    const { mode, via } = await session.resolveEffectiveSessionMode();
    return ctx.continue(`${mode} (${via})`);
  },
});
```

Logic worth testing goes to `src/commands/_lib/<group>/<name>.ts`, the folder of its command, as
`run<Name>(tokens, deps)`, its deps a `Pick<>` of the ports it reads, tested over the fakes of `tests/support/doubles/`. Three other places move with a new command, and
`npm run check` names the one you forgot: `tests/repository/command-surface.test.ts` pins the count of commands,
`src/commands/_lib/status/meta.ts` states it in the release notes, and `npm run docs:commands` regenerates
[docs/commands.md](commands.md). The recipe: [Add a command](architecture.md#add-a-command).

## A crew

A folder `src/crews/<name>/` with a `crew.ork.ts` in the procedural shape: the agents with the tool names they need,
an agent whose `.body()` calls the use case, `publishCrew(...)` at the end. The use case is
`application/run-<name>.ts` (`run<Name>(input, deps)`), its pure rules in `domain/`, each with its `*.test.ts`; the
use case test runs over the fakes. The command that launches it names it,
`launchCrew({ crews: createCrewHost(ctx.services), log: ctx.log }, "<name>", input)`, and `input` reaches the crew as
`inputs()`. Imports are relative and carry their `.ts` extension, because the runtime bundles each entry point from
the files as written.

- `advisor` is the smallest model: one agent, one `ctx.llm.complete`, no tools.
- `code-review` is the model for a sequential crew that reads `inputs()` and runs tools.
- `main-loop` is the model for a loop: `ctx.llm.act` runs the model ⇄ tools cycle over the agent's catalogue, under
  `.budget(...)`.

A folder starting with `_` is a development probe, never listed to users. Run any crew alone with
`bash scripts/run-crew.sh src/crews/<name>/crew.ork.ts --inputs '{...}'`
([Autonomous and embedded runs](headless.md)); the bundle check (`npm run bundle:check`) proves it bundles with the
runtime's flags and without any Node API. The recipe: [Add a crew](architecture.md#add-a-crew).

## Your own crews and commands, outside the checkout

The REPL takes `--crews-dir` and `--commands-dir` more than once, and the launcher passes on what it does not
recognise:

```bash
./orkeon-code -- --crews-dir ~/my-crews --commands-dir ~/my-commands
```

A crew named `x` is `<dir>/x/crew.ork.ts`; the first directory that has it wins, and the checkout's come first. The
runtime mounts each directory read-only (`/crews`, `/crews-1`, ...; `/cli-commands`, `/cli-commands-1`, ...). A crew
outside the checkout imports the shared code by a relative path to the checkout. This works in tool and source modes;
in docker mode the container sees the checkout's `src` and the project only, so there the files go in the checkout.

## A tool

**In TypeScript, in a crew.** `toolBuilder()` declares a name, a description, a JSON schema and an `execute` that runs
in the script; `.withAutonomousTool(tool)` on the agent hands it to the model, and `ctx.llm.act` offers it like a
built-in one. The permission catalogue of `main-loop` lists host tools by name and knows nothing of a built tool:
decide in the crew, from the mode, whether to attach it.

```ts
const wordCount = toolBuilder<{ text: string }, { words: number }>()
  .name("word_count")
  .description("Count the words of a text.")
  .withSchema({ type: "object", properties: { text: { type: "string" } }, required: ["text"] })
  .execute((input) => ({ words: input.text.trim().split(/\s+/).length }))
  .build();
```

**A tool of the runtime.** Check the name the host registers (`/debug-tool-call list`), then add it to its class in
`src/shared/domain/agent-policy/permission.ts` (`READ_TOOLS`, `NETWORK_READ_TOOLS`, or the edit and shell classes):
the mode-policy table decides which modes hand it to the model. When application code calls it, the call goes through
a port and an adapter of `src/shared/infrastructure/orkeon/`. The recipe: [Add a tool](architecture.md#add-a-tool).

**On the host.** The shell tool runs the commands of its allow-list: `Orkeon:Tools:Shell:ExtraAllowedCommands` adds
the build tools of your projects, `AllowInterpreters` opens `node`, `dotnet`, `npm`... ([Configuration](configuration.md)).
A tool written in C# is an Orkeon plugin (an assembly implementing `IOrkeonPlugin`); a tool served by an MCP server
needs no code at all. The REPL connects the servers of `MCP:Servers` and loads the plugins of `Plugins`, and their
tools join the assistant's catalogue once the session key `tools.extra` names them with their class
(`<name>:read|write`) ([Configuration](configuration.md#extra-tools-mcp-servers-and-plugins)).

## Prompts and behaviour

Every prompt is written from a behaviour specification, [Architecture](architecture.md#prompt-assembly), in this
project's own words ([ADR 0003](adr/0003-prompts-from-a-behaviour-specification.md)): change the specification first,
then the text, then the marker phrases its test pins. `node scripts/render-prompts.mjs <dir>` writes every prompt as
the model reads it, so a change is reviewed as the diff of two renders.

- **The main loop.** `src/crews/main-loop/domain/prompt-assembly.ts` builds the static header (behaviour rules, tools
  and what they can do, search playbook, the project's instructions file) and the user body (preferences, skills,
  memory, hooks, environment, history, gauge, request): one `build<Name>Block` renderer per block, a field of
  `PromptParts`, a place in `assemblePrompt`'s fixed order. A block's input is read in `application/context-gather.ts`,
  through the ports, and passed in `application/turn-prompt.ts`; the flags a session sets (`/effort`, `/passes`,
  `/fast`, `/proactive`, `/output-style`, `answer.language`) travel the same way.
- **Compaction and memory.** `src/shared/domain/compaction.ts` holds the summary and memory-extraction prompts and
  the markers the model later reads in its history; `src/shared/application/compaction/` runs them.
- **The crews.** Each crew's prompts sit next to its use case (`application/prompts.ts`, or its domain module) and
  have their own tests.

`npm run check:provenance` refuses the markers of another product's material, and `tests/repository/prompt-contract.test.ts`
checks every rendered prompt. The recipe: [Add a prompt block](architecture.md#add-a-prompt-block).

## Permission modes

A mode is stated once: an entry of `PERMISSION_MODES` (`src/shared/domain/permission-modes.ts`) and a row of
`MODE_POLICIES` (`src/shared/domain/agent-policy/mode-policy.ts`): read-only or not, and the classes of tools it
offers, the classes being the lists of `agent-policy/permission.ts`. Move a tool from one class to another and every
mode follows; the type check refuses a mode without its row; the tests pin the read-only promise of `plan` and
`dontAsk`. The five mode names are also known to the host gate, which treats an unknown name as `default`
(fail-closed): changing what a mode offers is a TypeScript change, adding a sixth mode is a runtime change too. The
session's rules, on a tool or on its arguments (`/permissions add allow shell_command command=npm test*`), are the
host gate's and need no code. The recipe: [Add a permission mode](architecture.md#add-a-permission-mode).

## Models and settings

Any OpenAI-compatible endpoint, chosen in the settings file (`Llm:BaseUrl`, `Llm:Model`); `/model` switches among
`Llm:AvailableModels` without relaunching; `ORKEON_*` environment variables override any key
([Configuration](configuration.md)). A new session key is a line of the declared key space
([Add a config key](architecture.md#add-a-config-key)).

## The limits

- The scripts run in Jint, single-threaded, with no Node API and no timers: `src/` imports nothing from `node:*`
  (the bundle check refuses it), and a command never does long work itself, it hands it to a crew.
- Application code never touches the runtime: it receives ports, and `tests/repository/architecture.test.ts` fails any import,
  and any use of a runtime global, that breaks the dependency rule.
- `.tools([...])` names host tools, and an unknown name fails every `act` call of the agent before the model is
  asked: a tool the runtime lacks cannot be added from here. `/debug-tool-call list` shows what the host offers.
- A tool result reaches the model cut at 4000 characters, with a larger cut for some tools
  (`Orkeon:Tools:ResultLimits`, [Configuration](configuration.md)).
- Declared hooks (`/hooks`) run around the tool calls of the dev steps, not in `/assistant`, and no `stop` hook runs
  ([Hooks](hooks.md)). Saved agents (`/agents`) are stored, not run: the delegation that would use them is on the
  [Roadmap](roadmap.md).
