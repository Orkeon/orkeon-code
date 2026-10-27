# ADR 0008: Orkeon main after #223, on the rc.6 pin

- **Status**: accepted
- **Date**: 2026-10-27
- **Amends**: [ADR 0007](0007-orkeon-after-217.md)

## Context

Orkeon #223 is merged on Orkeon `main` (`3ac6aa6`); no tag holds it yet. It is the second review of #217, which
[ADR 0007](0007-orkeon-after-217.md) adapted to before these fixes landed, and the Orkeon side opened #29 against
Orkeon Code with what now diverges:

- **`rag_eval` declares an edit** (#219, #223): it ingests its corpus and writes its reports. Orkeon Code listed it
  among the tools that read whatever the call, so the gateless fallback of the dev crews let it through in `default`
  where Orkeon's gate asks.
- **A read method of `http_api` that carries a body or a method-override header executes** (`X-HTTP-Method-Override`,
  `X-HTTP-Method`, `X-Method-Override`, any case): a server may run the method the header names. Orkeon Code read the
  method alone, and compared the argument keys, the `github` action and the method exactly where Orkeon compares
  them case aside, the action trimmed.
- **An MCP server's annotations count only when the server is trusted** (`MCP:Servers:<name>:TrustAnnotations: true`,
  false by default); otherwise every tool of the server is `Unspecified`, a write, whatever `readOnlyHint` says. The
  launchers and the Whisper example settings declared the speech server without it, so its three read-only tools
  were writes and the permissions page promised what the runtime no longer did.

Beside #29, three known issues of the roadmap were closed by #217 and #223 in the runtime and left in place by ADR
0007: a shell script is readable and a refused file no longer fails `index_codebase` (#215); the shell's environment
passes `SSH_AUTH_SOCK` and `XDG_RUNTIME_DIR` on, and `DBUS_SESSION_BUS_ADDRESS` to an unconfined shell, with
`Orkeon:Tools:Shell:Environment:SessionBus` for a confined one and `Propagate` for added names (#216); a scripted
command carries a group derived from its folder, printed by `/help` (#214).

Checked and left as they are: the reading of `budgetExhausted` and of the chain-depth refusal, and the seven crews
that call `crewBuilder().budget()` on a `sequential` process (`dev-spec`, `dev-change`, `dev-plan`, `dev-verify`,
`dev-implement`, `dev-batches`, `agent-run`). The new refusal, "the sequential process spends no budget", lives in
`JsCrewConfigurationAdapter.ToConfiguration`, which only the declarative shape of `orkeon run` and the forge go
through; the procedural crews of Orkeon Code do not, and #29 ran each of them on a build of #223 without a budget
error. The typings of #223 change in comments alone.

## Decision

- **The same pin.** `.orkeon-version` stays `1.0.0-rc.6`; the surface Orkeon Code targets is Orkeon `main` after
  #223, the one that tag will carry. The typings come from the sources until the tag (`scripts/sync-typings.sh` over
  `ORKEON_SOURCE`), as ADR 0002 to 0007 decided.
- **`rag_eval` has no line in the per-call table.** `declaredAccess` answers `null`: its class, `edit`, decides, as
  the catalogue already filed it (ADR 0007). The gateless fallback adds it to the tools `acceptEdits` runs without
  asking, beside `rag_ingest`, since the gate runs an edit there, and refuses it in `default`, where the gate asks.
- **`http_api` executes on a body or a method-override header, read as Orkeon reads the call.** `declaredAccess`
  reads `body` as present whatever its content, an empty string included, since the tool sends any non-null body;
  takes the headers' names from an object or from a JSON string holding one, any other shape carrying none; matches
  the argument keys case aside (`Method`, `BODY`); compares the method case aside, an empty one being no read method;
  and trims the `github` action and compares it case aside. The fallback and the permissions page follow. A plain
  GET keeps running without a question in `default`, for the reason ADR 0007 records.
- **The speech server is trusted where it is declared.** `orkeon-code` and `orkeon-code.ps1` export
  `ORKEON_MCP__Servers__whisper__TrustAnnotations=true` next to the transport and the command, the PowerShell
  launcher saving and restoring it like the others; the two Whisper example settings set `TrustAnnotations: true`.
  The three read-only tools stay reads, run in `dontAsk` without an allow rule; a server a user declares in their own
  settings is theirs to trust, and the permissions page says what an untrusted server's tools are.
- **Every grammar is indexed again.** `INDEXED_LANGUAGES` is the registry's list, bash included; the discovery
  skips a file the VFS still refuses instead of failing. The roadmap loses the three known issues, and the
  configuration page documents the two shell-environment keys of #216 next to the confinement mode.

## Consequences

- `rag_eval` under the gateless fallback asks nothing in `acceptEdits` and is refused in `default`, as the gate
  would; a `GET` with a body is asked about in `default` and `acceptEdits`.
- A session started by either launcher with `ORKEON_CODE_AUDIO_DIR` runs `whisper_info`, `list_audio` and
  `transcribe_audio` in `dontAsk` without an allow rule; a user's own settings must set `TrustAnnotations` for the
  same.
- `/analyze` on a project that holds shell scripts indexes them.
- Still to check live, against a build of Orkeon that includes #223: `transcribe_audio` in `dontAsk` without an allow
  rule from a launcher's session, `/analyze` on a fixture holding a `.sh`, `/help` printing one block per folder.

## Alternatives considered

- **Keeping `rag_eval` out of the `acceptEdits` tools of the fallback**, stricter than the gate: the fallback follows
  the gate's own reading of the classes in the writing modes (ADR 0007), and an edit runs in `acceptEdits`.
- **Trusting the server only from the launchers, not in the example settings**: a user who starts the REPL from a
  settings file would lose the three reads silently; the examples carry the key, with the server they declare.
- **Reading an empty body as none**: Orkeon sends any non-null body and executes on it; the table follows the
  runtime, so the fallback lets through exactly what the gate lets through, and a stricter or looser reading of one
  argument would open the difference the per-call table exists to close.
