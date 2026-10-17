# Roadmap

What Orkeon Code does not do yet, in the order we expect to address it. Items marked **runtime** need a change in
[Orkeon](https://github.com/Orkeon/orkeon) first.

## Before the first release

- **Original prompts.** Rewrite the behaviour blocks of the main loop and the compaction prompt from the
  specification in [Architecture](architecture.md#prompt-assembly); empty `scripts/provenance-baseline.json`.
- **A vendor-neutral instructions file.** `/init` writes, and the loop reads, `AGENTS.md`; `CLAUDE.md` stays readable
  for projects that already have one.
- **Comments in the project's own terms.** The sources still cite the internal tickets and design rounds of the
  experiment they come from.

## Next

- **Distribution.** An `orkeon-code` image or .NET tool that carries these sources, so no clone is needed.
- **One-shot launcher.** `orkeon-code --run "<request>"`: an unattended turn with the modes, settings and mounts of a
  session, from the launcher itself rather than `scripts/run-crew.sh` ([Autonomous and embedded runs](headless.md)).
- **In-process embedding** (runtime). The scripting layer published as a NuGet package, so a .NET application loads
  the crews without starting a process; and the crews exercised under the `orkeon-host` daemon.
- **Persistent sessions.** Resume a conversation after the REPL exits; keep the session mode and the permission
  rules across sessions.
- **Hooks that fire.** `/hooks` stores declarations; the engine that runs them is missing.
- **Cost and usage.** Real cost figures per provider, cache ratio, token counting for `/ctx-viz` and `/extra-usage`.

## Later

- Parallel tool calls (the runtime runs the calls of a model turn one after the other) and sub-agents (`/agents`
  stores configurations; delegation is not wired).
- A plan/task list the loop maintains (`/tasks` is a manual list today).
- Several sessions at once.

## Known issues

- A tool result reaches the model cut at 4000 characters, 32,000 for `file_read` (runtime).
- `web_scrape`, `scrape_element`, `rag_search`, `rag_ingest` and every MCP tool declare no access to Orkeon, so its
  gate treats them as writes, even when they only read: asked in `default` and `acceptEdits`, refused in `plan`, and
  in `dontAsk` without an allow rule (runtime; [Permissions](permissions.md)).
- The answer can be printed twice when console streaming is enabled.
- `/tasks` is a manual to-do list, not a monitor of background work.
- Some commands only partly do what their names promise: `/summary` (not saved to memory), `/status` (no runtime
  version nor provider), `/resume` (one in-memory session), `/context` and `/usage` (totals only, no per-category
  figures; cache hits only when the host reports them).
