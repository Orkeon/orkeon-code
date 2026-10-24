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
(`/mode bypassPermissions`), or for the project (`/config permissions.fallback bypassPermissions`, kept in the
project's `.orkeon/config.json`, so every session on that project starts there). In the REPL, `default` and
`acceptEdits` ask you before a call the mode does not allow outright; in a run without an operator nobody answers, and
the gate refuses what it would have asked about (the model reads `DENIED: …`). Give an unattended run a mode that
never asks: `bypassPermissions`, or `plan` and `dontAsk` for read-only work ([Permissions](permissions.md)).

Under `orkeon run` (`scripts/run-crew.sh`) the gate has no one to ask, and decides each call by the mode alone:

| Mode | Under `orkeon run` |
|---|---|
| `default` | Reads only: every other call is refused (the edits, `github`, `rag_eval`, `spawn_agent`, the shell, `http_api`) |
| `acceptEdits` | Reads and edits (`file_write`, `edit_file`, `node_*`, `edit_batch`, `structural_rewrite`, `spawn_agent`); `github`, `rag_eval`, the shell and `http_api` are refused |
| `plan`, `dontAsk` | Reads only |
| `bypassPermissions` | Everything |

An act given no `permissionMode` runs in `default`. An `onToolCall` hook sees only the calls the gate allowed, and an
`"ask"` it returns is checked again as an edit in `default`, so it is refused here.

What bounds a turn, whatever the mode:

- the crew budget of `main-loop`: 200 tool calls, 30 minutes, 400k tokens, 40 iterations of the loop;
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
Until Orkeon `1.0.0-rc.6` is published, neither exists at the pinned version and the script cannot run
([Development](development.md)). The crew reads its input from the JSON of `--inputs`. For `main-loop` it is what
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
error, `2` on a runtime error, `130` when cancelled. The session primitives exist in a standalone run too, but the
conversation buffer, the state bag and the typed memory start empty and end with the process: one run is one turn.

Every crew runs this way; its `crew.ork.ts` says in its header which `inputs` it reads (`code-review`:
`{ files?, commit? }`; `advisor`: none). CI checks that every command and crew loads (`scripts/smoke-runtime.sh`);
an unattended turn of `main-loop` against a model is exercised by hand, not by CI.

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
