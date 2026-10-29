# Roadmap

What Orkeon Code does not do yet, in the order we expect to address it. Items marked **runtime** need a change in
[Orkeon](https://github.com/Orkeon/orkeon) first.

## Before the first release

- **Comments in the project's own terms.** The sources still cite the internal tickets and design rounds of the
  experiment they come from.

## Next

- **One-shot launcher.** `orkeon-code --run "<request>"`: an unattended turn with the modes, settings and mounts of a
  session, from the launcher itself rather than `scripts/run-crew.sh` ([Autonomous and embedded runs](headless.md)).
- **In-process embedding.** Orkeon ships its scripting layer as the `Orkeon.Scripting` package (Orkeon #229): a .NET
  application runs a `crew.ork.ts` through `ICrewScriptRunner` without starting a process. What remains is ours: a
  host example that runs the crews of Orkeon Code that way, and the crews exercised under the `orkeon-host` daemon.
- **Hooks in the assistant.** `pre-tool` and `post-tool` hooks run around the model's tool calls in the dev steps
  ([Hooks](hooks.md)); `/assistant` does not run them yet, and nothing runs a `stop` hook.

## Later

- Sub-agents beyond the dev steps: the reviews of `/dev-spec` and `/dev-plan` and the audit of
  `/dev-batches` run as background children (`ctx.spawnBackground`) that `/tasks` monitors; a saved agent of `/agents` is still storage only, and the
  assistant does not delegate.
- The structural editor (`node_*`, `edit_batch`, `structural_rewrite`) in the assistant's prompts: the tools are in
  the catalogue, the assistant's prompts do not teach them yet. The dev steps use part of it: the roles of `/dev-batches` read
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
- `/tasks` monitors the children of `/dev-spec`, `/dev-plan` and `/dev-batches` only, through the session state: a stop waits for
  the crew's next look (about a second), and a send to an ended instance is a new run that knows the previous report
  only, not its context.
- Some commands only partly do what their names promise: `/summary` (not saved to memory).
