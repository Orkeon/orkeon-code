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
- **Persistent sessions.** Resume a conversation after the REPL exits; keep the session mode and the permission
  rules across sessions. The runtime persists a session already (`Persist`); Orkeon Code does not wire it yet.
- **Hooks that fire.** `/hooks` stores declarations; the engine that runs them is missing.
- **Cost and usage.** Real cost figures per provider, cache ratio, token counting for `/context` and `/usage`. The
  runtime reports the cache tokens (`session_stats`); the commands do not read them yet.

## Later

- Sub-agents through `spawn_agent` and `ctx.spawnBackground`: the runtime offers both, Orkeon Code uses neither yet
  (`/agents` stores configurations; delegation is not wired).
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
- `/tasks` is a manual to-do list, not a monitor of background work.
- Some commands only partly do what their names promise: `/summary` (not saved to memory), `/status` (no runtime
  version nor provider), `/resume` (one in-memory session), `/context` and `/usage` (totals only, no per-category
  figures; cache hits only when the host reports them).
