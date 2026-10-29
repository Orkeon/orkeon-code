# Autonomous and embedded runs

Orkeon Code is a set of TypeScript crews. The REPL is one way to run them, not the only one: the crew that answers
`/assistant` also runs with nobody at the keyboard, in one shot from a shell, on a schedule, in a CI job, or started
by your own application. This page says what each path needs, what bounds it, and what it does not do yet.

## Let it run on its own

Autonomy is a permission mode, not a flag. Give the turn the rights the task needs and the loop runs to the end
without a question:

| Mode | What the agent may do |
|---|---|
| `acceptEdits` | Read, fetch over the network, edit files. No shell |
| `bypassPermissions` | Everything in the tool catalogue, shell included |

Choose it per request (`bypassPermissions: migrate the tests to node:test`), for the session
(`/mode bypassPermissions`), or for every session (`"permissions.fallback": "bypassPermissions"` in the `orkeonCode`
block of your user settings: a project's `.orkeon/config.json` sets only `default`, `plan` or `acceptEdits`,
[Permissions](permissions.md)). In the REPL, `default` and
`acceptEdits` ask you before a call the mode does not allow outright; in a run without an operator nobody answers, and
the gate refuses what it would have asked about (the model reads `DENIED: …`). Give an unattended run a mode that
never asks: `bypassPermissions`, or `plan` and `dontAsk` for read-only work ([Permissions](permissions.md)).

Under `orkeon run` (`scripts/run-crew.sh`) the gate has no one to ask, and decides each call by the mode alone:

| Mode | Under `orkeon run` |
|---|---|
| `default` | Reads only, a `github` read action and a plain `http_api` GET included: every other call is refused (the edits, `rag_eval`, `spawn_agent`, the shell, a `github` or `http_api` write) |
| `acceptEdits` | Reads and edits (`file_write`, `edit_file`, `node_*`, `edit_batch`, `structural_rewrite`, `rag_ingest`, `rag_eval`, `spawn_agent`), a `github` read action and a plain `http_api` GET; the shell and the `github` and `http_api` writes are refused |
| `plan`, `dontAsk` | Reads only |
| `bypassPermissions` | Everything |

An act given no `permissionMode` runs in `default`. An `onToolCall` hook sees only the calls the gate allowed, and an
`"ask"` it returns is checked again as an edit in `default`, so it is refused here.

What bounds a turn, whatever the mode:

- the crew budget of `main-loop`: 200 tool calls, 30 minutes, 700k context tokens (the context counted once,
  Orkeon #224), 40 iterations of the loop;
- the script timeout of the settings: `Orkeon:Cli:ScriptCommands:Limits` for the REPL, `Orkeon:Scripting:Limits` for
  the `orkeon` tool of a standalone run (30 minutes each in the example);
- the host gate (`Orkeon:Security:PermissionGate:Enabled`), which checks every call against the mode behind the
  catalogue;
- the mounts: the project on `/workspace`, the scratch mounts `/output` and `/tmp`, nothing else;
- the shell allow-list of the settings.

Prefer docker mode for an unattended `bypassPermissions` turn: the shell then runs in the container, and the project
is the only directory of your machine it can write ([SECURITY.md](../SECURITY.md)).

## One shot from a shell

`scripts/run-crew.sh` runs one crew outside the REPL: with the `orkeon` tool (`Orkeon.Scripting.Cli` from nuget.org,
pinned in `.config/dotnet-tools.json`, needs the .NET 10 SDK) or, without an SDK, with the `orkeon-runners` image.
The tool is on nuget.org at the pinned version; the image is not published yet at `1.0.0-rc.6`;
`ORKEON_CODE_MODE=source ORKEON_SOURCE=<checkout>` runs it from an Orkeon checkout instead ([Development](development.md)).
It reads the settings file `ORKEON_CODE_SETTINGS` names, else `config/appsettings.local.json`, and mounts no
`/user-config`: neither `~/.orkeon-code/appsettings.json` nor the `orkeonCode` block of your user settings applies to
a crew run this way. The crew reads its input from the JSON of `--inputs`. For `main-loop` it is what
`/assistant` passes: the request and the mode. `permissionRules` (the session's rules, as `/permissions` lists them:
`deny http_api`, `allow shell_command command=npm test*`) and `extraTools` (the tools of MCP servers and plugins, as
`tools.extra` names them) are what the launching command resolves in the REPL; a standalone run has no session to take
them from, so pass them only when you know what the catalogue should hold. No session rule exists outside the REPL:
`permissionRules` only shapes the catalogue (a deny rule on a whole tool removes it), and an allow rule spares no
question. No flag of `orkeon run` sets the mode; it belongs to the crew's inputs
(`--inputs '{"prompt":"…","permissionMode":"acceptEdits"}'`), and the gate needs
`Orkeon:Security:PermissionGate:Enabled: true` in the settings file. `orkeon run` registers the analysis tools
(`node_*`, `edit_batch`, `structural_rewrite`, `batch_anchors`, `structural_search`…) only while
`RaggableTree:Enabled` is not `false`; with it `false`, an act given the `main-loop` catalogue fails with
`UnknownToolError`.

```bash
export DEEPSEEK_API_KEY=...                       # the variable named by Llm:ApiKeyEnvVar
ORKEON_CODE_WORKSPACE=~/src/app bash scripts/run-crew.sh src/crews/main-loop/crew.ork.ts \
  --inputs '{"prompt": "add a --json flag to the report command, with a test",
             "permissionMode": "bypassPermissions"}'
```

The script mounts the project read-write on `/workspace` and a scratch directory on `/output`, as the REPL does. The
runner prints the crew's result as JSON on stdout and exits with `0` when the script completed, `1` on a script
error, `2` on a runtime error, `130` when cancelled. A call the gate refuses is not an error: the model reads the
refusal as the tool's result and the run still exits `0`, so read the JSON to know what was done. The session primitives exist in a standalone run too, but the
conversation buffer, the state bag and the typed memory start empty and end with the process: one run is one turn.

Every crew runs this way; its `crew.ork.ts` says in its header which `inputs` it reads (`code-review`:
`{ files?, commit? }`; `advisor`: none). CI checks that every command and crew loads (`scripts/smoke-runtime.sh`);
an unattended turn of `main-loop` against a model is exercised by hand, not by CI.

## A dev crew, step after step

`scripts/dev-run.sh` chains the steps of a dev crew without anyone at the keyboard: one fresh `orkeon run` per step,
through `scripts/run-crew.sh`, which passes the settings, the model and the mounts (`ORKEON_CODE_SETTINGS`,
`ORKEON_CODE_MODEL`; with `ORKEON_CODE_MODE=source` and `ORKEON_SOURCE`, the tool built from that Orkeon checkout
instead of the one nuget.org serves). The variable `DEV_RUN_RUNNER` names another command, given the crew and `--inputs` alone: it
passes its own `-s` and `-m`, or the crew runs on no settings and no mount. Each step's output goes to
`.orkeon/dev/<code>/runs/<crew>-<n>.log` in the project, never whole to the terminal, which shows its last line. After
each step the script reads the last line of the work code's event log: `.orkeon/dev/<code>/batches-state.md`, or the
file `--log` names in the project. `/dev-batches` writes Code's own log, in the REPL, where its `completed` launches each
batch; the crews this script runs one by one do not, so name a log they move (the work code's `<CODE>-BATCHES-STATE.md`),
or every chain stops after its first step (nothing moved). The dev-batches crew would only name the next batch and log it
launched, so the script refuses it (exit `64`): a run of a whole plan without anyone at the keyboard stays the REPL's
`/dev-batches`. Without `DEV_RUN_RUNNER`, the project's trust is checked once, before the first step, where the
terminal can answer; each step then runs with its standard input on `/dev/null`, so nothing it asks can hold the chain.

```bash
ORKEON_CODE_WORKSPACE=~/src/app bash scripts/dev-run.sh dev-verify demo \
  --inputs '{"batch":"F2","plan":"demo"}' --log workbench/demo/DEMO-BATCHES-STATE.md --max-steps 10 --wait 60 --retries 2
```

- the project declined at the trust question: nothing runs, exit `0`; refused without a terminal: exit `2`;
- `closed` (the line `- <date> <time> closed`, a trailing blank or CR aside): the batches are closed, exit `0`;
- an event whose detail starts with `BLOCKED` or `GAPS`: a human decides, exit `3`;
- the same line as before the step: nothing moved, exit `4`, never a loop;
- `--max-steps` (default 10) reached: exit `5`;
- a step that exits `1` or `130` stops the chain with that code; one that exits `2` with a rate limit in its log
  (`429`, `rate limit`) is run again after `--wait` seconds, `--retries` times, then stops it with `2`.

`--inputs` is required: the crew's own inputs, which its `crew.ork.ts` names in its header. Each step is a new process
with an empty session: what a step needs (the batch, the plan) travels in its inputs or lives in the files of the work
code. A crew run this way gets none of what its command does first: the dev steps' check that the gate is on
(`/dev-verify`, `/dev-plan`, `/dev-spec`, `/dev-change`, `/dev-implement`) and their rule sets are not applied, so give the run a settings file whose gate and rules you chose.

## On a schedule, in a CI job

The command above is one line of a cron table, a systemd timer or a Windows scheduled task. In a CI job, the image
path of `scripts/run-crew.sh` needs Docker and the API key in the job's environment, from a secret of the job; the
settings file is read from `ORKEON_CODE_SETTINGS`, and the project to work on from `ORKEON_CODE_WORKSPACE`. Review
the diff the run leaves before anything merges it: the agent is an operator with the rights of its mode, not a
reviewer of its own work.

## From your application

Three ways, from the simplest:

1. **As a process, from any language.** Start `orkeon run <crew.ork.ts> --inputs <json>` with the `orkeon` tool or
   the `orkeon-runners` image, with the mounts and the settings `scripts/run-crew.sh` passes, and read the JSON on
   stdout. The script is the reference for the command line; the exit code says whether the result is one.
2. **As a service.** The `orkeon-host` daemon of the Orkeon release archive (a systemd unit, a Windows service or a
   container) hosts crew folders and exposes each one behind a chat channel and, opt-in, as an A2A skill: a
   `POST /a2a/tasks/send` whose `skillId` is the crew's name runs it on the task's input. A hosted `.ork.ts` crew
   needs esbuild on the machine, which the full release archive carries and the container image does not. Orkeon
   Code's crews have not been exercised under the daemon yet: the input a hosted procedural crew receives is the
   daemon's contract ([Orkeon service host](https://github.com/Orkeon/orkeon/blob/main/docs/architecture/service-host.md)).
3. **In-process, in .NET: not yet.** The scripting layer that runs `.ork.ts` files (`Orkeon.Scripting`) ships inside
   the `orkeon` tool and the REPL, not as a NuGet package, and the `Orkeon` package is the C# builder API, which does
   not load scripts. Tracked on the [Roadmap](roadmap.md) (runtime).

Whatever the path, the agent's reach is the same: the mounts you give it, the shell allow-list of the settings, the
permission mode of the input, and the host gate behind them.
