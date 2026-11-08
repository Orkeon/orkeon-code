# ADR 0022: one canonical spelling for the host's paths, and the path lists

- **Status**: accepted
- **Date**: 2026-11-08
- **Extends**: [ADR 0001](0001-clean-architecture.md)

## Context

Every path the code and the model handle is a virtual path of the Orkeon VFS (`/workspace`, `/output`, `/tmp`,
`/user-config`, `/sessions`, `/session-history`, `/memory`). The runtime maps it to the disk and, for its shell tool,
rewrites a `/workspace/…` argument to the physical base before the process starts and the base back to `/workspace/…`
in stdout and stderr (`docs/architecture.md`, "The VFS and the host platform"). Read at Orkeon `b0fa31f`, that loop
has holes:

- on native Windows the outbound rewrite stops at the first space (`C:\ici est\mon repertoire\un dossier\f.txt` comes
  back as `/workspace/un dossier\f.txt`) and compares the base ordinally: a re-cased `c:\Ici Est\…`, or the `C:/…`
  git for Windows prints, leaks as a disk path;
- under WSL a Windows program (`cmd.exe`, a Windows `dotnet.exe`, reachable with
  `Orkeon:Tools:Shell:Confinement: None` only) prints `C:\…` and expects `C:\…` while the base is `/mnt/c/…`: nothing
  is rewritten either way;
- a path the user types or the model writes in another spelling (`C:\…`, `C:/…`, `/mnt/c/…`, `\\wsl$\…`) is refused
  by the VFS with the list of the mounts instead of being brought back to its virtual spelling;
- no list of allowed or forbidden paths exists beyond the VFS rights, and one written on paths alone would be
  bypassed by a spelling its matcher does not know.

Two facts of the runtime the design rests on: `onToolResult` answering `{ context }` replaces the whole text the
model reads for that result, and an `{ input }` answered by `onToolCall` is gated again by the runtime, so a converted
input passes the permission gate and the VFS rights check on its canonical spelling. One fact limits it: the gate
runs on the raw input before `onToolCall`, and only a rewritten `{ input }` is gated again.

## Decision

- **One canonical spelling, in Orkeon Code.** Every spelling of a physical path of a mount is brought back to the
  virtual path with `/` and no trailing separator, by pure functions of the domain (`host-layout.ts`,
  `host-paths.ts`): a drive, `\\?\`, a UNC share, `/mnt/<d>/…` under WSL, `\\wsl$\` and `\\wsl.localhost\` for the
  session's distribution, the case of a drive and of a UNC ignored, the bases matched segment by segment. A relative
  path, a `.` or `..`, a path under no mount and a path of another distribution are left as written. On a posix host
  without a Windows base every function is the identity.
- **The host comes from a file the launcher writes**, `/user-config/launch.json`, beside the `config.json` it already
  writes there: the flavour, the distribution and the automount root under WSL, each mount's base as given to
  `--mount`, with its Windows spelling under WSL (`wslpath -w`). The scripts read no new environment and no setting
  (V-04). Docker mode writes a posix host without mounts. Absent, malformed or of another version: the identity, and a
  row of `/doctor`. The context is read once per run by an infrastructure module every entry point binds over the
  global tools (`bindHostContext`); an adapter loaded alone finds the identity.
- **One wrap for every act.** `createLlm` wraps the callbacks of every act in `hostCallbacks`, with or without
  callbacks of the crew's own: `onToolCall` canonicalises the path fields of the call (`path`, `root_path`,
  `working_directory`, `paths`, the operations of an `edit_batch`, the words of a `shell_command`) and answers the
  canonical `{ input }`; `onToolResult` hands the inner callbacks the canonical result and replaces the text the model
  reads when a spelling changed. The adapters of the Files, Shell and ShellJobs ports canonicalise inbound and
  outbound, the typed prompt is canonicalised with its fenced blocks kept, and so is the top a `git rev-parse` prints.
- **Orkeon Code never spells a path physically for the runtime.** The runtime checks every mount-prefixed word of a
  command against the VFS rights before spelling it for the process, and asks every right for a command outside its
  read-only allowlist; no command of the Shell port is free of text the user or the model wrote. A `C:\…` written by
  this project would skip that check. `fromVirtual` serves the round-trip tests only. On native Windows the runtime
  spells `/workspace/…` for the process; under WSL a Windows program keeps receiving `/mnt/c/…` until the runtime
  learns the Windows spelling of a mount.
- **Two path lists, two `/config` keys**: `paths.deny` and `paths.allow`, comma-separated entries in any spelling,
  matched on the canonical one, without case on a Windows disk and under a drive of WSL; a bare entry covers itself
  and everything below it; a deny wins; a non-empty allow refuses every path outside it. The project file adds denies
  and only narrows allows. The deny entries become deny rules of the gate (listed by `/permissions`, refusing a
  canonical-spelled call early); the callbacks' check holds against every spelling, each operation of an edit batch,
  what a folder reader reaches and the words of a shell command.
- **The `/user-config` mount is closed to the model**: built-in deny rules on its readers, writers, folder readers and
  on any shell command naming it, beside the shared memory's rules at the three sites that sync them, and the same
  refusal in the callbacks. The code reads it through the Files port, which the gate does not see.
- **Four issues are left to the runtime**, opened on Orkeon the same day: #300, the outbound rewrite of the shell
  cuts a quoted path at its first space; #301, it matches the base ordinally, missing another case and `C:/…`; #302,
  a mount has no Windows spelling under WSL, so a Windows program receives `/mnt/c/…`; #303, the gate runs before
  `onToolCall`, so a canonicalised input is judged once on the raw spelling. None is needed for the above.

## Consequences

- A posix host with no Windows involvement is untouched: the identity context wraps nothing, and the adapters pass
  the text as they received it.
- A model call spelled `C:\…` on a path tool is judged by the gate once on that spelling (Orkeon #303): with no
  matching rule an interactive mode asks with that spelling, then the canonical input is gated again; a mode that
  refuses what no rule covers refuses before the conversion. A shell command is judged by the gate on its text and
  by the callbacks on its canonical paths; every result is canonical.
- A project `paths.allow` entry dropped is named twice, by `/doctor`'s rows `settings: project file` and
  `host: paths`; a change of `paths.*` applies at the next start, the context being read once per run.
- `/mnt/c/Windows/System32/cmd.exe` is out of reach under bubblewrap: the WSL to Windows program scenario exists
  without confinement only; the documentation says so.
- Checks: `npm run check` green at each lot; the launcher tests drive `./orkeon-code` with a fake `wslpath` on the
  `PATH`, without it, in docker mode and on a project folder holding a quote, a space and a backslash, and read
  `launch.json` back; the WSL and native Windows checks are the user's.
