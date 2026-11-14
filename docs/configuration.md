# Configuration

Orkeon Code has no configuration format of its own: the settings file is an Orkeon runtime settings file, read by
the REPL through `--settings`. Start from [`config/appsettings.example.json`](../config/appsettings.example.json).

## Where the settings come from

1. `--settings FILE` on the launcher;
2. `ORKEON_CODE_SETTINGS`;
3. `config/appsettings.local.json` in the checkout (ignored by git), in a clone only: an install never reads it;
4. `~/.orkeon-code/appsettings.json` (`%USERPROFILE%\.orkeon-code\appsettings.json` on Windows; `ORKEON_CODE_HOME`
   moves the folder);
5. `~/.config/orkeon-code/appsettings.json` (`%APPDATA%\orkeon-code\appsettings.json` on Windows), the old place:
   still read, with a warning naming the new one;
6. Orkeon's own `~/.config/Orkeon/appsettings.json` (`%APPDATA%\Orkeon\appsettings.json` on Windows), the file
   `orkeon init` writes. The launcher then passes no `--settings`: the REPL reads it itself (docker mode mounts it,
   the container having no home of yours). An absolute `XDG_CONFIG_HOME` replaces `~/.config` in 5 and 6.

With none of them and a terminal, `orkeon-code setup` runs: it asks the provider (the DeepSeek example or the Ollama
one), the model, and the **name** of the environment variable that holds the key, never the key; it writes
`~/.orkeon-code/appsettings.json`, readable by you alone, and says which variable to export. `orkeon-code setup`
runs it at any time, and asks before replacing an existing file. Without a terminal the launcher stops and names
these choices.

The `orkeonCode` block of that file holds your own session settings, which a project's `.orkeon/config.json` cannot
widen ([what a project file may set](permissions.md#what-a-project-file-may-set)). The launcher copies the block alone,
never the `Llm` section, to `<state>/user-config/config.json` at each start and hands it to the session read-only, on
`/user-config`, in every mode.

Environment variables prefixed `ORKEON_` override the file (`__` separates sections): `ORKEON_Llm__Model`,
`ORKEON_Llm__ApiKey`. `ORKEON_CODE_MODEL` is a launcher shortcut for `ORKEON_Llm__Model`.

## The LLM

| Key | Meaning |
|---|---|
| `Llm:Model` | Model id sent to the endpoint |
| `Llm:BaseUrl` | OpenAI-compatible endpoint (`https://api.deepseek.com`, `https://api.openai.com/v1`, a local server...) |
| `Llm:ApiKeyEnvVar` | Name of the environment variable that holds the key. The key itself never goes in the file |
| `Llm:AvailableModels` | Models `/model` offers to switch to without relaunching |
| `Llm:Temperature`, `Llm:MaxTokens`, `Llm:TimeoutSeconds` | Generation settings |
| `Llm:MaxRateLimitWait` | Longest rate-limit window a call waits out before it fails, `00:05:00` by default |
| `Llm:Profiles:<name>:MaxRateLimitWait` | The same bound for one named profile of the host, `00:05:00` by default |
| `Llm:Profiles:<name>:Fallback`, `Llm:Profiles:<name>:FallbackBudgetSeconds` | The profiles a call of `<name>` moves to, in order, when it fails in a way a retry cannot cure: a transport error, a 5xx, a 429 once the retries are spent, a timeout |
| `Llm:ModelCapabilities:<model id>` | What a model takes: `Thinking` (`None`, `EffortOnly` for a model that always reasons, `Toggle`, `Budget`), `ReasoningEfforts`, the efforts it accepts (an `effort` a listed model does not take is sent as the highest level below it that both the model and the provider's field take, or the lowest of them when none is below, with a warning; a model listed nowhere gets every effort the provider's field takes, with a warning), `Vision`, `AudioInput`, `AudioOutput`. `Llm:ModelCapabilities:<provider>/<model id>` sets them for one provider alone |
| `Llm:Thinking:Enabled`, `Llm:Thinking:Effort` | Reasoning mode and how hard the model reasons, for the providers that have one |

What the table leaves out:

- **`Llm:MaxTokens` on a model that always reasons** (GLM-5.3 on Z.AI):
  - Its reasoning counts against `MaxTokens`. A step that answers in one long JSON, such as the plan of
    `/dev-plan`, needs room: at 24576 the reply came back cut or empty, at 65536 it fits. When the budget runs out,
    the refusal says so with the tokens spent: `the output budget (MaxTokens = …) ran out, reasoning included` for an
    empty reply, `cut short: the output budget ran out` for a reply cut in the middle.
  - GLM-5.3 takes the efforts `low`, `high` and `max` only. The runtime sends a `medium` as `low`, with a warning
    (Z.AI refuses `medium` there, HTTP 400 code 1210). Leave `Llm:Thinking:Effort` out, or ask for `high`: at `low`,
    the model hardly reasons, and the plans it writes are refused more often.
- **`Llm:MaxRateLimitWait`**:
  - A 429, or a 529 with a reset header, waits until the window the provider announces (`retry-after-ms` in
    milliseconds as OpenAI and TypeSafe send it, else `Retry-After`, compared with the provider's reset headers; the
    longest wins) resets instead of failing the turn.
  - A window longer than this fails the call at once with `LlmRateLimitException`, the wait in its message.
  - `00:00:00` waits for nothing.
- **`Llm:Profiles:<name>:Fallback`, `Llm:Profiles:<name>:FallbackBudgetSeconds`**:
  - A 4xx or a blocked content is answered as it is, a stream moves only before its first token, and each move is an
    `llm.fallback` event in the host's log.
  - `default` names the host's own profile.
  - A chain never comes back to a profile it started from.
  - `FallbackBudgetSeconds` bounds the whole chain, checked between two profiles, never cutting a call in flight.
  - Omitted, each profile's own `TimeoutSeconds` and retries bound it.
  - The Jev, Kev and Liquid examples let `small` fall back on `large`.
  - Not the `Fallback` of a route stage (`Orkeon:Decision:Profiles:<name>:Stages`), which is the profile a route
    picks when no choice reaches its threshold.
- **`Llm:ModelCapabilities:<model id>`**:
  - Unset, the runtime's own table applies.

Orkeon recognises the native providers from the endpoint and the model (OpenAI, Anthropic, Gemini, Mistral, DeepSeek,
Z.AI, Moonshot, local servers...): the list and their options are in the
[Orkeon LLM providers documentation](https://github.com/Orkeon/orkeon/blob/main/docs/architecture/llm-providers.md).
An option a provider cannot honour produces a warning, never a silent drop.

### Prompt cache

- A provider that caches the prompt (DeepSeek and OpenAI by themselves, Anthropic with `cache_control`) reports the
  tokens read from its cache and written to it.
- Orkeon keeps them per model and `/usage` and `/context` show their sum in `cacheRead` and `cacheWrite` (`n/a`
  while no call reported the count, never `0`, which reads as measured: the runtime leaves an unreported count out).
- The cache's lifetime is a per-call option of Orkeon, `orkeon:cache_ttl` (`5m` or `1h`, from an agent's cache
  setting): Anthropic honours it, the OpenAI-compatible providers and Ollama log that they cannot.
- Orkeon Code sets none, so each provider keeps its own default lifetime (a 1-hour write would cost twice the prompt
  rate).
- Anthropic caches only what a request marks: every agent of Orkeon Code marks its system prompt and its tool
  definitions (`.cache({ systemPrompt: true, tools: true })`), a prefix its prompts keep identical turn after turn,
  so from a session's second call `cacheRead` counts what Anthropic served from its cache.
- The agent's request wins over a host default `Llm:Cache`.

### What `/usage` counts

 `usedTokens` and `estTokens` are the conversation's size in the context window, estimated by the host. The `llm*`
columns are counted by the providers over every call: `llmInTokens` sent, `llmOutTokens` received
(`llmReasoningTokens` a part of them), `llmTokens` their sum. `cacheRead` and `cacheWrite` are parts of
`llmInTokens`, and `cacheRatio` is `cacheRead / llmInTokens`: all of them come from the host's usage account when it
keeps one, else from `session_stats`, never one from each: a cache count the account did not measure reads `n/a`,
even when `session_stats` has one. `/context` takes its `cacheRead` and `cacheWrite` by the same rule. A figure the
host does not report reads `n/a`, and so does a ratio over an unreported cache read: a measured `0` reads `0`.

A model on this machine: [`config/appsettings.ollama.example.json`](../config/appsettings.ollama.example.json) is
the example on [Ollama](https://ollama.com) serving `qwen3.5:2b` (`ollama pull qwen3.5:2b` first), no key and
nothing leaving the machine; Orkeon recognises Ollama by its port, 11434. Ollama serves every model with a window
of 4,096 tokens unless its environment says otherwise, and Orkeon does not widen it per request: the system prompt
of a turn is about 2,250 tokens before the tool schemas and the conversation, so set `OLLAMA_CONTEXT_LENGTH=16384`
on the Ollama service, or the model silently loses its instructions and its tools.

### A decision model in front of the LLM

- Orkeon can put a decision model, Jev (TypeSafe's System One, `jev-latest`), in front of a model.
- The host serves one decision provider among three, TypeSafe (`Orkeon:TypeSafe`,
  `TYPESAFE_API_KEY`), Liquid (`Orkeon:Liquid`, `LIQUID_API_KEY`) and Kev (`Orkeon:Kev`, a local server, never
  deduced): `Orkeon:Decision:Provider` names it, otherwise the host deduces it from the one section present, or from
  the one key set when no section is.
- Two sections, or two keys and no section, refuse the start, and the input guard's section is
  `Orkeon:Guardian:Llm`, fail-closed by default (`Orkeon:Decision:Guard` and `Orkeon:TypeSafe:Guard`
  are refused at start as unknown keys).
- A decision profile works the same whatever the provider: a *decision profile* (`Orkeon:Decision:Profiles:<name>`)
  wraps a named LLM profile (`Llm:Profiles:<name>`) with stages that route the request to the profile that fits it,
  guard it (prompt injection, the risks you name) or verify the answer and escalate to a stronger profile when it
  does not hold.
- `Orkeon:Guardian:Llm:Phases` may add `Output`: it judges the output of a crew *task*, holding its streamed deltas
  until they are judged, so a guarded task's answer shows at once at its end.
- `ctx.llm.act`, which every agent of Orkeon Code runs on, is not judged on output.
  [`config/appsettings.jev.example.json`](../config/appsettings.jev.example.json) is the example: the
  `Orkeon:TypeSafe` section (the key in `TYPESAFE_API_KEY`, never in the file), two LLM profiles, `small` and
  `large`, and the decision profile `guarded` over them.
- The session key `llm.profile` names the profile the agents of the commands run on, `/config set llm.profile
  guarded`: every crew a command launches builds its agents on it, the child agents of the dev steps included, and
  the launch log and `/config list` show it.
- Without the key nothing changes: the agents run on the host's default model, as before.
- A name the host does not declare fails the crew's load, its error listing the profiles the host knows.
- A plain LLM profile works the same way, with no decision model in front.
- The per-call model of `/advisor` (`advisor.model`) still applies on top of the profile.
- The `/model` override does not: under a profile the assistant's turns do not send it (it would replace the
  profile's model, and on a decision profile the model of its escalation target too), and each turn logs `/model
  override '<name>' ignored: llm.profile <profile> is active`.
- `/model show` names the profile, and `/model <name>` stores the override with a warning, to apply again once
  `llm.profile` is unset.
- Kev on this machine and Liquid, step by step, with their examples
  [`config/appsettings.kev.example.json`](../config/appsettings.kev.example.json) and
  [`config/appsettings.liquid.example.json`](../config/appsettings.liquid.example.json): [Decision models
  locally](decision-models-local.md).
- The stages and their settings are in [Orkeon's decision
  models](https://github.com/Orkeon/orkeon/blob/main/docs/architecture/decision-models.md).

Claude through a Max plan: [`config/appsettings.anthropic.example.json`](../config/appsettings.anthropic.example.json)
targets `https://api.anthropic.com` with `claude-opus-5-5` and the key in `ANTHROPIC_API_KEY`. Since October 2026 a Max
plan includes monthly API credits (100 USD on Max 5x, 200 USD on Max 20x, no rollover), spent through an API key of the
Anthropic Console organisation linked to the plan (on claude.ai, Settings, Billing, API credits, Link organization; the
link is made once); beyond them the key is billed at the API's usage rates. Signing in with the plan itself is reserved
to Anthropic's own applications and is not a way to run Orkeon Code. The example sets no `Temperature`: the current
Claude generation refuses one, and Orkeon sends only what the file sets.

The agent calls tools through every provider: the runtime's tool loop (`ctx.llm.act`) reads the tool calls of the
Anthropic and OpenAI formats, runs the read calls of a model turn up to `MaxParallelToolCalls` at once and the
others one after the other, each call through the permission gate, and sends the results back in the provider's tool protocol. A tool result reaches the model cut at
4000 characters, 32,000 for `file_read`, 12,000 for the analysis tools.

## Settings Orkeon Code relies on

| Key | Why |
|---|---|
| `Orkeon:Security:PermissionGate:Enabled` = `true` | The host checks every tool call the model makes against the `/permissions` rules and the mode, and asks you when the mode says so ([what it does not see](permissions.md)) |
| `Orkeon:Cli:ScriptCommands:Limits:ExecutionTimeout` | Wall-clock limit of each script engine of `orkeon-repl`: a command's, and a crew's, so an `/assistant` turn's |
| `Orkeon:Cli:ScriptCommands:Limits:MemoryLimitBytes` | Memory limit of those engines: 64 MB by default, the example sets 2 GiB |
| `Orkeon:Scripting:Limits:ExecutionTimeout`, `Orkeon:Scripting:Limits:MemoryLimitBytes` | The same limits for `orkeon run`, the tool `scripts/run-crew.sh` runs a crew with (30 seconds and 100 MB by default; the example sets 30 minutes and 2 GiB). `orkeon-repl` does not read them |
| `Orkeon:Tools:Shell:AllowInterpreters` | Lets `shell_command` run interpreters (`node`, `dotnet`, `npm`...), needed to build and test most projects |
| `Orkeon:Tools:Shell:ExtraAllowedCommands` | Commands added to the shell allow-list (`make`, `cargo`...) |
| `Orkeon:Tools:Shell:WindowsPaths:<virtual path>` | Under WSL, the Windows spelling of a mount (`"/workspace": "C:\\proj"`): a Windows program (`cmd.exe`, `code.exe`, `git.exe` of Git for Windows) run by `shell_command` gets its arguments and results in that spelling, where a Linux program gets `/mnt/c/proj` |
| `Orkeon:Tools:Shell:Confinement:Mode` | `Auto` (default: bubblewrap on Linux, Seatbelt on macOS, AppContainer on Windows, none inside a container), `None`, `Bubblewrap`, `Seatbelt` or `AppContainer` |
| `Orkeon:Tools:Shell:Environment:SessionBus` | Whether a confined shell (bubblewrap, Seatbelt, AppContainer) receives the session bus, `DBUS_SESSION_BUS_ADDRESS`, which the keyring credential helper of `gh` needs |
| `Orkeon:Tools:Shell:Environment:Propagate` | Names of variables added to the shell's allow-list |
| `Orkeon:Tools:ResultLimits:Limits:<tool>` | The cut of a tool's result, in characters |
| `Orkeon:Tools:ResultLimits:MaxParallelToolCalls` | The read calls of one model turn that run at once: 4 |
| `Orkeon:Rag:Retrieval:MinScore` | The score under which a passage is dropped, for every RAG search and not only the shared memory |
| `Orkeon:Tools:GitHub:Token` | The token of the `github` tool, read once when the tool is registered; prefer the variable below to a token written in a settings file, which the examples leave out |
| `Orkeon:Tools:GitHub:TokenVariable` | The environment variable the `github` tool reads its token from when `Token` is unset: `GITHUB_TOKEN` by default, then `GH_TOKEN` |
| `Orkeon:Tools:Firefox:*` | The `firefox` tool, which drives the Firefox of the host over WebDriver BiDi, with nothing to download |
| `Orkeon:Cli:ConsoleStreaming:Enabled` | Streams the answer as it is generated |
| `Orkeon:Cli:Tui:Theme` | The palette the split-pane console starts on: `dark`, `light` or `none`; without it `dark`, or `none` under `NO_COLOR`. Any other value refuses the start. `/theme` changes it for the session |
| `Orkeon:Cli:ScriptCommands:MaxScripts` | Commands the loader keeps: 200 by default, above this project's command surface |
| `RateLimiting:*` | Request rate limits towards the provider |

What the table leaves out:

- **`Orkeon:Tools:ResultLimits:Limits:<tool>`**:
  - 4000, `file_read` 32000, `node_read` 256000, `shell_command` 10000, and 12000 for the twelve analysis tools
    (`dependency_graph`, `sub_graph`, `edge_list`, `codebase_search`, `symbol_detail`…), whose JSON
    puts `truncated`, the counts and the cursor first, so a cut result still says it is partial.
- **`Orkeon:Tools:Firefox:*`**:
  - `ExecutablePath` when it is not on the `PATH`, `Headless` to hide its window, which shows by default (without a
    display it starts headless), `Profile`, `AllowedProfiles` and `DeniedProfiles` for a profile other than the
    disposable one, `Lifetime`: `run` by default, the browser closes with the agent's turn.
- **`Orkeon:Security:PermissionGate:Enabled` = `true`**:
  - The launcher turns it on unless the settings file says otherwise.
  - Without it no call is checked and the modes only shape the catalogue.
- **`Orkeon:Cli:ScriptCommands:Limits:ExecutionTimeout`**:
  - It stops while a tool call waits for your answer. 5 minutes by default.
  - A turn that indexes a large repository needs more: the example sets 30 minutes.
  - A `/dev-batches <code> F<n> --audit full` run can take about an hour (build 900 s, whole suite 900 s, three
    validations of 300 s each, plus the model's time): set 60 minutes or more for it.
- **`Orkeon:Tools:Shell:WindowsPaths:<virtual path>`**:
  - Unset, every program gets the Linux spelling.
- **`Orkeon:Tools:Shell:Confinement:Mode`**:
  - Confined, each shell command runs under `bwrap` (Linux, tool and source modes), network off unless
    `Confinement:AllowNetwork`, programs outside the system directories listed in `Confinement:ReadOnlyPaths`.
  - A command fails when it cannot be confined.
  - The examples set `None`.
  - A settings file without the key confines, outside a container.
  - `/dev-batches --concurrency` above 1 works under Bubblewrap from a runtime that binds a linked worktree's git
    dir.
  - On an older one git fails inside a batch's worktree, and the run refuses itself in one line.
  - Confined, the run's closing push reaches no remote (no network, `HOME=/tmp`, so no credentials): the run stays
    open with the `git push` command.
  - Push it from a terminal, then the next `/dev-batches` closes the run without pushing again.
  - See [SECURITY.md](../SECURITY.md).
- **`Orkeon:Tools:Shell:Environment:SessionBus`**:
  - `false` by default, since through the bus a command can start a process outside the sandbox.
  - An unconfined shell (`Confinement:Mode` `None`, the example settings) and the code sandbox receive it.
  - `SSH_AUTH_SOCK` and `XDG_RUNTIME_DIR` reach every shell, so git reaches a private remote through the ssh agent
   .
- **`Orkeon:Tools:Shell:Environment:Propagate`**:
  - A name holding a secret word (`KEY`, `TOKEN`, `SECRET`, `PASSWORD`, `PASSWD`, `PASS`, `CREDENTIAL`, `AUTH`,
    `PAT` as a whole segment), starting with `ORKEON_`, or whose value carries URL credentials is dropped with a
    warning.
- **`Orkeon:Tools:ResultLimits:Limits:<tool>`**:
  - A release before it cuts them at 4000, `truncated` last: set them to 12000 there.
  - A cut result ends with `[... truncated, N chars omitted. …]`.
  - The audit of `/dev-batches` reads that notice.
- **`Orkeon:Rag:Retrieval:MinScore`**:
  - None by default, so a question with no answer still gets passages.
  - The examples set 0.6, measured on the shared memory's reference set with the local embedder: 0.5 still answered
    the question with no answer, 0.7 lost recall.
  - Its effect on a search in documents has not been measured, and another embedder has another scale.
- **`Orkeon:Tools:GitHub:TokenVariable`**:
  - The launcher's Docker mode hands `GITHUB_TOKEN`, `GH_TOKEN` and the variable named here to the container, each
    when it is set.
  - The native modes inherit the environment.
  - Without a token the tool's description says where to set it.
  - A token shows as `***` in results and logs, and neither key takes a variable reference.
- **`Orkeon:Tools:Firefox:*`**:
  - `host` keeps it open with its tabs from one turn to the next, one browser per profile, until `close`, the window
    is closed by hand or the console stops.
  - A browser the `host` keeps stays open when the session switches to `plan` or `dontAsk`, which withhold the tool:
    the agent cannot drive it from there.
  - It needs the source mode: the release runtimes do not have the tool, and the docker image was not checked for a
    Firefox.
- **`Orkeon:Cli:ConsoleStreaming:Enabled`**:
  - The example enables it.
  - A command prints nothing more once the answer streamed.
  - With `/dev-batches --concurrency` above 1, each batch's streamed answer comes line by line: on the plain console
    prefixed by its ticket (`[t2] `), the foreground answer alone as it arrives.
  - In the TUI on the batch's own screen, without the prefix.

### How long a turn may last

 Two limits bound an `/assistant` turn, and the first one reached ends it:

- the script engine's `ExecutionTimeout` above, which stops while a question waits for you;
- The main-loop crew's own budget, written in its code (`src/crews/main-loop/crew.ork.ts`): 200 tool calls, 700k
  context tokens and 30 minutes of wall time, which stops while a tool call waits for your answer.
  - The context is counted once: each call charges its completion plus what its prompt grew by, or the
    part of it the provider's cache did not serve, so a turn of n calls on a context of c tokens spends about c plus
    its completions, never its whole context again at each call.
  - That clock is Orkeon's and, like the engine's, it stops while the gate waits for your answer: only the model's
    own work counts, and a question left unanswered does not end the turn.
  - When the context tokens reach the limit the turn runs no further tool: the model makes one last call without
    tools, its answer is shown under a line saying the turn stopped on its budget, and only a last call that fails
    or answers nothing ends the turn in an error.
  - A tool-call or wall-time limit still ends it in an error.

`Orkeon:Cli:ScriptHost:RunCrewTimeout` (10 minutes by default) bounds only a crew a command waits for (`runCrew`);
Orkeon Code starts every crew with `runCrewAsync`, which it does not bound, so the example leaves it out.

## Session settings

Inside the REPL, `/config` lists, reads and writes the session keys, stored in the project's `.orkeon/config.json`.
`/config keys` lists them all.

| Key | When omitted | Effect |
|---|---|---|
| `permissions.fallback` | `default` | the mode used when neither a prefix nor `/mode` chose one |
| `tools.extra` | | the extra tools offered to the model ([below](#extra-tools-mcp-servers-and-plugins)) |
| `voice.reply` | | reads each answer aloud ([speech output](speech.md#speech-output)) |
| `answer.language` | | the language the assistant answers in, unless a request is written in another one |
| `compaction.trigger` | the window minus the room one turn needs | the token count at which the automatic compaction runs |
| `compaction.prune` | `off` | the host's decision model prunes the stale tool results of a turn in progress |
| `route.agents` | `off` | at each launch of a crew, the host's decision model picks the cheapest profile of `route.ladder` that fits the command; inside a crew, the same for the act of a reviewer or of the auditor |
| `route.ladder` | `small,large` | the host's LLM profiles the routing picks among, cheapest first |
| `skills.suggest` | `off` | the host's decision model adds to a turn the project's skills that fit its request |
| `dev.workDir` | the repository pack's `layout.work`, else `workbench` | the work folder the dev steps read and write, relative to the checkout |
| `dev.prAuto` | `false` | `/commit` and the close of a dev step prepare the pull request as `--pr` does, without being asked |
| `memory.dir` | `.orkeon/memory` | the [shared memory](shared-memory.md)'s folder, relative to the project |
| `memory.project` | the `origin` remote's name, else `local` | the project the entries name and the index collection `memory-<project>`, a kebab-case name |
| `memory.autoAdmitAudited` | `false` | `/memory admit` admits a candidate an audit backs without asking |
| `paths.deny`, `paths.allow` | | the paths no tool of the model reads or writes, and the only paths it may reach ([permissions](permissions.md#the-path-lists)) |
| `review.lenses` | all three | the lenses of `/review`, comma-separated among `correctness`, `security` and `style` |
| `llm.profile` | the host's default model | the host profile every crew's agents run on ([the LLM](#the-llm)) |
| `advisor.model` | the session's own, which makes it a self-review | the model of `/advisor`'s second opinion |
| `commit.requireConfirm` | `true` | `false` lets `/commit` run without its confirmation |
| `spinnerVerbs` | | |

How some of them are set:

```text
/config set answer.language French
/config set compaction.trigger 90k
/config set compaction.prune on
/route on
/config set route.ladder small,large
/skills suggest on
/config set dev.workDir backstage/tasks
/config set memory.dir docs/memory
/config set paths.deny /workspace/secrets, tests/fixtures/real
/config set llm.profile guarded
```

What the table leaves out:

- **`compaction.prune`** needs a [decision provider](decision-models-local.md) on the host; the mechanism is in
  [How a turn runs](turn.md#compaction-and-memory).
- **`route.agents`** is also set by `/route on`; see [Routing a crew to a profile](turn.md#routing-a-crew-to-a-profile).
- **`skills.suggest`** is also set by `/skills suggest on`; see
  [Suggesting skills for a turn](turn.md#suggesting-skills-for-a-turn).
- **`dev.workDir`** serves `/dev-status` and `/dev-learn` too. `/commit` reads it as well, and leaves the work folder
  out of a commit unless a path inside it is named.
- **`dev.prAuto`** writes the pull request's body under `<work>/pr-<slug>/PR.md`. The pull request is then opened
  with the runtime's `github` tool when the host offers it, the session allows it and the tool has a token
  (`GITHUB_TOKEN`, [settings](#settings-orkeon-code-relies-on)). Otherwise the `gh pr create` command to type is
  printed, with the reason.
- **`memory.dir`** is never under `.claude/` or `.git/`, and never the agent memory's `.orkeon/agent-memory`.
- **`paths.deny` and `paths.allow`** are comma-separated, in any spelling of the host. They are matched on the
  virtual spelling, a deny winning, and applied at the next start.
- **`llm.profile`** names an LLM profile, or a decision profile with Jev in front.

### Commands that change how the next turns run

`/model`, `/effort`, `/passes` (an alias of `/review`), `/fast`, `/proactive` and `/output-style` change how the next
turns run.

`/effort` also sets the provider's thinking. The stored level is sent as the act's `effort` by `/assistant`, by every
dev step (`/dev-spec`, `/dev-plan`, `/dev-batches`) and by the agents these start; nothing is sent while no level is
stored. The levels are `low`, `medium`, `high`, `xhigh` and `max`. Orkeon Code sends
the level as stored and the runtime judges it: a level the provider's field or the model does not take
(`Llm:ModelCapabilities`) is sent as the highest one below it that both take, and the runtime's log says so.

`/effort` reads that judgement from the runtime, for the model the session's turns run on (its `llm.profile`, else
its `/model` override, else the host's own model):

- `/effort show` lists the levels the model takes (`glm-5.3 takes low, high, max`) and, for a stored level it does
  not take, the level sent in its place;
- setting such a level stores it all the same, since the iterations follow it, and warns: `⚠ effort: glm-5.3 does
  not take 'medium': 'low' is sent (it takes low, high, max).` A model that takes no effort gets none, and the
  warning says so. A model the capability table does not know gets the level unchecked: `/effort show` says it,
  without a warning;
- the panel of a bare `/effort` marks each level that would be sent as another one, or not at all;
- `/model` gives the same warning after a switch, when the stored level does not go as asked on the new model.

The dev steps and their agents may run on another model: the warning speaks of the session's model only. On a
runtime before Orkeon #361 (the tool and docker modes on 1.0.0), nothing is said of the model's levels.

### What the user settings narrow

- `permissions.fallback`, `tools.extra`, `memory.autoAdmitAudited`, `dev.prAuto` and `paths.allow` set in the
  project file are narrowed by the `orkeonCode` block of the user settings (a project `true` over a user `false` or
  no value is dropped, as is an allow entry outside the user's list, with a warning): `/config set` writes such a
  value, then says, under "persisted", that it is ignored and where your own setting goes, and `/doctor`'s row
  `settings: project file` names it.
- `/config set --session` is not narrowed.
- `paths.deny` set in the project file adds to the user's list instead.
- Both lists, with the host the launcher wrote to `/user-config/launch.json`, are read once at the start:
  `/doctor`'s row `host: paths` shows the host, each mount's base, the lists as they apply and every entry or file
  it could not use, and a change of `paths.*` applies at the next start.

### The start script

- At the REPL's start the runtime runs the file its key `Orkeon:Cli:Session:StartScript` names, once, and puts what
  it prints before the first request you type.
- The launcher sets it to `/tmp/orkeon-code/session-start.ork.ts`, a copy of `scripts/session-start.ork.ts` made at
  every start: it names the state files of the dev batches a compaction wrote in the last 7 days
  (`.orkeon/dev/<code>/state-F<n>.md`, with the first open step) and the batches Code's event log leaves open.
- It prints nothing when there is none.
- Set `Orkeon__Cli__Session__StartScript` to another virtual path to run your own, or, on Linux and macOS, to an
  empty value to run none.
- Make it a `.ork.ts`, which the runtime runs through its script host: any other file goes to `sh` through
  `shell_command`, which fails here (`.sh` files are refused, `sh` is not among the shell's commands, and in tool
  and source modes the shell reads the host's `/tmp`).
- `sh scripts/session-start.sh <project>` prints the same lines in a terminal.

### Keys of the repository pack

The repository pack (`.orkeon/repo.yaml`, else the harness's) can also give `tests.trait_pattern`, an Orkeon Code key
the harness ignores: how a test names the sheet id it covers, which the gate of a batch's audit (`/dev-batches <code> F<n> --audit`) looks for under the test
roots. It is one line holding `<id>` exactly once and `<name>` at most once; `<name>` stands for `tests.rule_trait`,
which it then needs. At most 80 characters, no tab and no single quote; a run of spaces matches any number of
spaces. Without it, `tests.rule_trait` alone gives the default `[Trait("<name>", "<id>")]`. A Node repository, whose
tests then carry `// rule: BR-01`:

```yaml
tests:
  rule_trait: rule
  trait_pattern: "// <name>: <id>"
```

It can also give `layout.test_files`, another key the harness ignores: the test files that sit beside the code, as
gate patterns (`*` matches any run of characters, `/` included). `/dev-batches` counts a path as a test file when
it lies under `layout.tests` or matches one pattern: the implementer may not write it, the test author may, and a run
needs one of the two keys. A Node repository whose tests sit beside the code:

```yaml
layout:
  domain: src
  test_files: ["src/*.test.ts"]
```

`layout.tests` never names a source root (`tests: src` beside `domain: src`): both roles would be refused that folder,
and reading the pack reports it as an issue (⚠ at the start of `/dev-batches`).

## Extra tools: MCP servers and plugins

The REPL connects the MCP servers of Orkeon's `MCP:Servers` settings and loads the plugins of its `Plugins` section
([Orkeon MCP documentation](https://github.com/Orkeon/orkeon/blob/main/docs/architecture/mcp.md)); their tools join
the host's. The assistant uses one once the session key `tools.extra` names it:

| Key | Value |
|---|---|
| `tools.extra` | Entries separated by commas or spaces, each `<name>` or `<name>:<read\|write>`. Without a class, a tool is a write. Omitted: no extra tool |

The class decides which modes offer the tool: `read` in every mode, `write` in `default`, `acceptEdits` and
`bypassPermissions` only. Mark `read` only a tool that changes nothing and sends nothing off the machine. The
[permission gate](permissions.md#extra-tools) still decides each call. `/config set` refuses an entry that is not the
notation, that names a built-in tool, or that names a tool twice.

- A server's declaration (`MCP:Servers:<id>`) also takes `CallTimeout` (`00:01:00` by default: a call
  past it ends as a tool error; the [speech server](speech.md#speech-to-text) gets 15 minutes) and `ConnectTimeout`
  (30 s).
- `Tools:Allow` and `Tools:Deny`, which filter the server's tools before they are registered, so a denied tool is
  absent for `tools.extra` too, which warns of it (never deny `record_and_transcribe`, `speak` or `stop_speaking`:
  `/voice` and `/say` call them).
- `Headers` (a value `env:VAR` reads the variable; a transport header is refused) and `Auth` (`Bearer`, `Basic`, or
  OAuth 2 client credentials and device code, the secret read from an environment variable, the device code shown on
  stderr).
- A `Url` that carries credentials must be https or loopback.
- `Transport: Sse` is the Streamable HTTP transport: a server that speaks only the 2024-11-05 HTTP+SSE transport no
  longer connects.
- A plugin is a folder `<name>/` under the `Plugins` directory, holding `plugin.json` (`name`, `version`,
  `orkeonVersion`, `entryAssembly`, `tools`) beside its assembly.
- A flat `.dll` is refused, and `dotnet new orkeon-plugin` scaffolds the folder.

For instance, the speech server this repository ships ([below](speech.md#speech-to-text)) registers six tools, three of
which fit the list: `transcribe_audio`, `list_audio` and `whisper_info`. The other three, `record_and_transcribe`,
`speak` and `stop_speaking`, serve `/voice` and `/say` and stay out of it. Once the server is connected:

```text
/config set tools.extra transcribe_audio:read,list_audio:read,whisper_info:read
```

A name is matched against the names the host registers, case-insensitively as Orkeon matches them, and the turn
uses the registered spelling: an MCP server's `get-file-contents` is listed as `get-file-contents` (in any case), not
`get_file_contents`; `/debug-tool-call list` shows the registered names. `/permissions` shows the extra tools, the
ones the host does not register, and the entries it ignores; every turn warns about a listed tool the host does not
register, and leaves it out. In docker mode, a `Stdio` server's command
runs inside the container.

## Sessions

The REPL saves the conversation after each turn and when it ends (`Orkeon:Cli:Session:Persist`, `true` in the example
settings), and the launcher keeps it outside the project: in `~/.orkeon-code/projects/<project>/` once installed,
`.crew-output/projects/<project>/` in a clone, `<ORKEON_CODE_STATE>/projects/<project>/` when that variable is set.
`<project>` is the folder's name and a short hash of its path, so two projects of the same name never share it;
`project.json` there names the path. Nothing is written under the project's `.orkeon/sessions`: `/doctor` warns when it finds sessions there.

| Start | What it brings back |
|---|---|
| `orkeon-code` | A fresh session: the last one moves to the project's `history/` first |
| `orkeon-code --continue` (`-c`) | The session you quit |
| `orkeon-code --resume` | The saved sessions, newest first (date, title, messages, id), then asks which one |
| `orkeon-code --resume <number or id>` | That one, without asking (an id prefix that matches one session is enough) |

- Without a terminal, `--resume` alone prints the list and exits with code 2.
- The newest 50 saved sessions are kept (`ORKEON_CODE_SESSIONS_KEEP`, 1 to 9999).
- A session without a message is not kept.
- A second start while a session is open on the same project warns, leaves the open one alone and keeps its own
  beside it, in the history from the next start.
- Inside the REPL, `/resume` lists the saved sessions (the launcher mounts `history/` read-only on
  `/session-history`) and `/resume <number or id>` brings one back in place: the session of now is
  saved to an archive beside its own file, which the next start moves to the history, then the chosen one replaces
  the conversation, its state and its title, and the next turn continues it.
- The line editor's history (the up arrow) is not kept.

- The typed memory (`/memory`, and the facts a compaction saves) is kept per project too, in
  `<Orkeon:Cli:Memory:RootDirectory>/<project>/memory.json`: `Orkeon:Cli:Memory:Persist` is `true` in
  the example settings, and the REPL turns it on when the key is absent.
- `orkeon run` keeps it only when the settings say so, and without it the memory ends with the process.
- The launcher sets `RootDirectory` to `/memory`, the `memory/` folder beside the sessions, outside the project, so
  neither git nor the file tools see it.
- `/clear` and a new session leave the memory in place, and `/memory delete` removes an entry.
- Without the launcher (`orkeon run`, `scripts/run-crew.sh`), the example settings name
  `/workspace/.orkeon/typed-memory`: the runtime's default, `/workspace/.orkeon/memory`, is the folder of the
  [shared memory](shared-memory.md), which the typed memory must not enter.

`--llm-log` among the REPL arguments writes the LLM log to `<project state>/llm-logs`, never into the project;
`--llm-log-path <folder>` is passed as given and wins over a bare `--llm-log`.

## Launcher environment

| Variable | Effect |
|---|---|
| `ORKEON_CODE_MODE` | `docker`, `tool` or `source` |
| `ORKEON_CODE_SETTINGS` | Settings file |
| `ORKEON_CODE_MODEL` | Model for this run |
| `ORKEON_CODE_AUDIO_DIR` | Folder of audio and video files: turns [speech-to-text](speech.md#speech-to-text) on (tool and source modes) |
| `ORKEON_CODE_VOICE` | `1`: opens the microphone to [`/voice`](speech.md#dictation) and the speaker to [`/say`](speech.md#speech-output) (with `ORKEON_CODE_AUDIO_DIR`) |
| `ORKEON_CODE_STATE` | Where `/output`, `/tmp`, `/user-config` and the transcripts live (default `.crew-output/` in a clone, `<home>/projects/<project>` in an install); the [sessions](#sessions) and the typed memory go under its `projects/<project>/` |
| `ORKEON_CODE_SESSIONS_KEEP` | How many saved [sessions](#sessions) a project keeps (default 50) |
| `ORKEON_CODE_HOME` | An install's own folder: its `appsettings.json`, its `trusted-folders.json`, its state and its demo repository (default `~/.orkeon-code`). A clone reads its `appsettings.json` and `trusted-folders.json` there too |
| `ORKEON_CODE_IMAGE` | Another runtime image (docker mode) |
| `ORKEON_REPL` | The command line that starts the REPL (tool mode) |
| `ORKEON_SOURCE` | Orkeon checkout (source mode) |
| `ORKEON_ESBUILD_PATH` | esbuild binary (tool and source modes) |
| `ORKEON_CODE_TRUST` | `1`: starts an untrusted folder without a terminal, only when `CI=true`, storing nothing ([Trusted folders](permissions.md#trusted-folders)) |

The launcher also exports `Orkeon__Security__PermissionGate__Enabled=true` and `Orkeon__Cli__Session__Persist=true` unless
they are set already (the settings file still wins over them), `ORKEON_Orkeon__Cli__Session__SessionsDirectory=/sessions`
and `ORKEON_Orkeon__Cli__Memory__RootDirectory=/memory` (which win over it), and, in tool and source modes,
`ORKEON_ALLOW_EXTERNAL_MOUNTS=1`, so the REPL, started from the project, accepts the `/output`, `/tmp`,
`/user-config`, `/sessions`, `/session-history` and `/memory` mounts of the state directory. `/permissions` says whether the gate is on.
