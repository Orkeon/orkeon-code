# Roadmap

What Orkeon Code does not do yet, in the order we expect to address it. Items marked **runtime** need a change in
[Orkeon](https://github.com/Orkeon/orkeon) first.

## Before the first release

- **Comments in the project's own terms.** The sources still cite the internal tickets and design rounds of the
  experiment they come from.

## Next

- **One-shot launcher.** `orkeon-code --run "<request>"`: an unattended turn with the modes, settings and mounts of a
  session, from the launcher itself rather than `scripts/run-crew.sh` ([Autonomous and embedded runs](headless.md)).
- **In-process embedding** (runtime). The scripting layer published as a NuGet package, so a .NET application loads
  the crews without starting a process; and the crews exercised under the `orkeon-host` daemon.
- **Sessions from inside the REPL.** A session is kept per project and comes back at start (`orkeon-code
  --continue`, `--resume [<number or id>]`); `/resume` lists the saved ones but cannot swap the REPL's own session,
  and switching sessions without a restart comes next.
- **Hooks in the assistant.** `pre-tool` and `post-tool` hooks run around the model's tool calls in the dev steps
  ([Hooks](hooks.md)); `/assistant` does not run them yet, and nothing runs a `stop` hook.
- **Cost and usage.** Real cost figures per provider, and token counts per category for `/context` and `/usage`.

## Later

- Sub-agents beyond the dev steps: the reviews of `/dev-spec`, `/dev-change` and `/dev-plan` and the audit of
  `/dev-verify` run as background children (`ctx.spawnBackground`) that `/tasks` monitors; a saved agent of `/agents` is still storage only, and the
  assistant does not delegate.
- The structural editor (`node_*`, `edit_batch`, `structural_rewrite`) in the assistant's prompts: the tools are in
  the catalogue, the assistant's prompts do not teach them yet. The dev steps use part of it: the roles of `/dev-implement` read
  and change a file by node (`node_replace`, `node_insert`, `node_ensure`, `edit_batch`) and the batch reads
  `affected_tests` and refreshes the index (`incremental_reindex`); the reviewers search with `structural_search`.
  Three parts wait:
  - `structural_rewrite` stays denied whole in the dev steps, a dry run included: it takes its paths as an array
    plus a `glob`, and a rewrite of many files is not a step's change. It remains an edit tool of the assistant.
  - `documented_in` and `documents_of` for the placement `/dev-learn` proposes: the learner asks the model with one
    extraction, without a tool loop, so it would have nothing to call them with.
  - The Markdown intent operations, for the French twins and the work folder's files: no crew places text in a
    section yet.
- A limit of the parallel batches (`/dev-batches --concurrency`): a batch's audit runs inline in its agent, so
  `/tasks` does not list it.
- A plan/task list the loop maintains (`/tasks` is a manual list today).
- Several sessions at once.
- Kept as is: the pull-request question of `/commit` stays a command prompt (`ctx.prompt`), asked before any
  crew runs; `human_input` serves the questions a model asks during an act.

## Known issues

- A tool result reaches the model cut at 4000 characters: 32,000 for `file_read`, 256,000 for `node_read`, 10,000 for
  `shell_command`. The cut is set per tool by `Orkeon:Tools:ResultLimits` ([Configuration](configuration.md)).
- A turn's token budget sums the prompt and completion of every call, so a turn pays its whole context again at each
  call and the cost grows with the square of its calls; it bounds neither the size of the conversation nor what a
  provider bills with its cache. When the sum reaches the limit the turn runs no further tool: the model answers in
  one last call, shown under a line saying the turn stopped on its budget (Orkeon #218). The main loop runs with
  1.5M and reads by range meanwhile (runtime; a budget that counts the context once remains open;
  [Configuration](configuration.md)).
- The answer can be printed twice when console streaming is enabled: disable it for an unattended run.
- A project's shell scripts (`.sh`, `.bash`) and its `.ps1`, `.bat` and `.cmd` files cannot be read by the agent:
  `file_read` and the node readers answer `File extension '.sh' is not allowed`, the runtime's path validator blocking
  these extensions for reading as for writing, and the discovery of `index_codebase` fails on the first one. The index
  is therefore asked for every grammar but bash: the scripts enter no index, and `/analyze` works on a project that
  holds some (runtime; a read let through and a refused file skipped are asked of Orkeon, Orkeon #215).
- From the shell the assistant reaches no private remote: the runtime hands a `shell_command` an allow-list of
  environment variables that drops `DBUS_SESSION_BUS_ADDRESS` and `SSH_AUTH_SOCK`, so a keyring-backed credential
  helper (`gh auth git-credential`, the `gh` default) and the ssh agent give git nothing, and a private repository
  answers `Repository not found` while a public one works. Fetch, pull and push such a remote from your terminal
  (runtime; the session's sockets passed to the shell are asked of Orkeon, Orkeon #216).
- `/help` lists the 58 commands as one block, `[(no group)]`: the runtime groups a runner's commands by the first word
  of their name, and a scripted command's name is one word. The folders of `src/commands/` give the order of the
  list, not its headings (runtime; a group per scripted command, derived from its folder, is asked of Orkeon, Orkeon #214).
- `/tasks` monitors the children of `/dev-spec`, `/dev-change`, `/dev-plan` and `/dev-verify` only, through the session state: a stop waits for
  the crew's next look (about a second), and a send to an ended instance is a new run that knows the previous report
  only, not its context.
- Some commands only partly do what their names promise: `/summary` (not saved to memory), `/status` (the runtime
  version is the pin, not read from the running host), `/context` and `/usage` (totals only, no per-category
  figures).
