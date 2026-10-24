# Roadmap

What Orkeon Code does not do yet, in the order we expect to address it. Items marked **runtime** need a change in
[Orkeon](https://github.com/Orkeon/orkeon) first.

## Before the first release

- **Comments in the project's own terms.** The sources still cite the internal tickets and design rounds of the
  experiment they come from.

## Next

- **Distribution.** An `orkeon-code` image or .NET tool that carries these sources, so no clone is needed.
- **One-shot launcher.** `orkeon-code --run "<request>"`: an unattended turn with the modes, settings and mounts of a
  session, from the launcher itself rather than `scripts/run-crew.sh` ([Autonomous and embedded runs](headless.md)).
- **In-process embedding** (runtime). The scripting layer published as a NuGet package, so a .NET application loads
  the crews without starting a process; and the crews exercised under the `orkeon-host` daemon.
- **Sessions from inside the REPL.** A session is kept per project and comes back at start (`orkeon-code
  --continue`, `--resume [<number or id>]`); `/resume` lists the saved ones but cannot swap the REPL's own session,
  and switching sessions without a restart comes next.
- **Hooks in the assistant.** `pre-tool` and `post-tool` hooks run around the model's tool calls in the dev steps
  ([Hooks](hooks.md)); `/assistant` does not run them yet, and nothing runs a `stop` hook.
- **`/dev-implement` corrections and grouping.** A correction from a GAPS verdict, the steps sharing one test class run
  as one cycle, the affected tests between rounds and the measured access cost come next; `/dev-implement` runs plain
  steps for now.
- **Cost and usage.** Real cost figures per provider, cache ratio, token counting for `/context` and `/usage`. The
  runtime reports the cache tokens (`session_stats`); the commands do not read them yet.

## Later

- Sub-agents beyond the dev steps: the review of `/dev-plan` and the audit of `/dev-verify` run as background
  children (`ctx.spawnBackground`) that `/tasks` monitors; a saved agent of `/agents` is still storage only, and the
  assistant does not delegate.
- The structural editor (`node_*`, `edit_batch`, `structural_rewrite`) in the assistant's prompts: the tools are in
  the catalogue, the prompts do not teach them yet.
- A plan/task list the loop maintains (`/tasks` is a manual list today).
- Several sessions at once.

## Known issues

- A tool result reaches the model cut at 4000 characters: 32,000 for `file_read`, 256,000 for `node_read`, 10,000 for
  `shell_command`. The cut is set per tool by `Orkeon:Tools:ResultLimits` ([Configuration](configuration.md)).
- `github` and `rag_eval` declare no access to Orkeon: asked in `acceptEdits` too, refused in `plan` and `dontAsk`
  ([Permissions](permissions.md)).
- `http_api` and every MCP tool declare no access to Orkeon, so its gate treats them as writes, even when they only
  read: asked in `default` and `acceptEdits`, refused in `plan`, and in `dontAsk` without an allow rule (runtime;
  [Permissions](permissions.md)). The web and RAG tools declare theirs since Orkeon #126.
- The answer can be printed twice when console streaming is enabled.
- `/tasks` monitors the children of `/dev-plan` and `/dev-verify` only, through the session state: a stop waits for
  the crew's next look (about a second), and a send to an ended instance is a new run that knows the previous report
  only, not its context.
- Some commands only partly do what their names promise: `/summary` (not saved to memory), `/status` (the runtime
  version is the pin, not read from the running host), `/context` and `/usage` (totals only, no per-category
  figures).
- The runtime registers its `github` tool without a token: `/commit --pr` gets GitHub's refusal (401) until the host
  can be given one, and then prints the `gh pr create` command.
