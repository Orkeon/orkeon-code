# Security Policy

## Supported versions

Orkeon Code is in alpha: only the latest release and `main` receive security fixes.

## Reporting a vulnerability

**Please do not open a public issue for security vulnerabilities.**

Report them through [GitHub Private Vulnerability Reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
on this repository ("Security" tab → "Report a vulnerability"), with a description, the impact, the steps to
reproduce (commands, permission mode, settings without keys) and the version (`/version`, `.orkeon-version`).

We aim to acknowledge reports within **72 hours** and to provide a remediation plan or fix within **30 days** for
confirmed issues.

A vulnerability in the runtime itself (VFS escape, shell allow-list bypass, SSRF filter bypass, a permission gate
decision) is reported to [Orkeon/orkeon](https://github.com/Orkeon/orkeon/security) instead; if you are unsure
which side it belongs to, report it here and we will route it.

## Threat model: an LLM that edits and runs code

LLM output triggers tool calls. Treat the agent as an untrusted operator with the rights the mode gives it.

- **What it can touch.** File tools see only the VFS mounts: the project on `/workspace` (read-write) and the scratch
  mounts `/output` and `/tmp`. `shell_command` runs commands from an allow-list (interpreters and extra commands are
  operator opt-ins in the settings) with `/workspace` as its directory. A command that can write (an interpreter, an
  added command) needs the write right on every path its command line names and on its working directory; what a
  script it runs reaches by itself is outside that check.
- **Where the shell runs.** In docker mode, inside the container: the host directories it can write are the
  project and the state directory (`.crew-output/` by default, `ORKEON_CODE_STATE`), which backs `/output` and `/tmp`;
  the Orkeon Code sources and the settings file are mounted read-only. In tool and source modes, on your machine as your user. Orkeon's confinement,
  `Orkeon:Tools:Shell:Confinement:Mode`, is `Auto` by default (bubblewrap on Linux, Seatbelt on macOS, AppContainer
  on Windows, none inside a container); the example settings set it to `None`, which leaves no OS-level confinement
  beyond the allow-list. Under bubblewrap (`Auto` on Linux, or `Bubblewrap`), each command runs under `bwrap` in a view built from the mounts (each at its virtual path, the system
  directories read-only, nothing else of the host) with the network off unless `Confinement:AllowNetwork` is `true`.
  A program installed outside the system directories (`/opt`, `nvm`, a `.dotnet` folder) needs its folder in
  `Confinement:ReadOnlyPaths`. Where `bwrap` cannot confine the command (another OS, `bwrap` missing, user namespaces
  refused, as in an unprivileged container), the call fails with the reason and the command never runs unconfined.
  Docker mode stays the recommended isolation, for `bypassPermissions` above all.
- **Permission modes.** `plan` and `dontAsk` withhold every write and network tool; `default` asks you before every
  edit, command and network call (`[y] once / [s] session / [n] no`); `acceptEdits` edits files without asking and
  asks before a command or a network call; `bypassPermissions` allows everything. Session rules (`/permissions`)
  deny or allow a tool or the calls whose argument matches a pattern: a deny holds in every mode, `bypassPermissions`
  included, and an allow spares the question in every mode but `plan`. The host gate
  (`Orkeon:Security:PermissionGate:Enabled`, which the launcher turns on) enforces the modes and the rules: keep it
  enabled. See [Permissions](docs/permissions.md).
- **MCP servers and plugins.** Their tools reach the model only once `tools.extra` names them, and run code you chose
  to configure: a `Stdio` MCP server is a process on the machine that runs the REPL (in the container in docker mode).
  An MCP tool declares no access, so the gate treats it as a write: asked in `default` and `acceptEdits`, refused in
  `plan`, and run in `dontAsk` only under an allow rule.
- **Prompt injection.** Repository content, web pages and tool output can carry instructions aimed at the model.
  Run untrusted repositories in `plan` mode, in docker mode, and review diffs before committing.
- **Secrets.** API keys stay in environment variables (`Llm:ApiKeyEnvVar`, `ORKEON_Llm__ApiKey`), never in a tracked
  file. The agent can read every file of the project: do not mount a project holding secrets you would not send to
  your LLM provider.
- **Network.** `http_api` and the web tools reach the network, after asking you in `default` and `acceptEdits`,
  and never in `plan` and `dontAsk`; the runtime denies private, loopback and metadata addresses by default. An
  unconfined shell command (an interpreter, a build tool) reaches the network on its own.

In scope here: the commands and crews of this repository (a permission mode or rule that does not withhold what it
should, a command that builds a shell command from unchecked input, a secret written to the output or the session
export), the launchers and the release artefacts.
