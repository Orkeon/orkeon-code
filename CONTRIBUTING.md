# Contributing to Orkeon Code

Thanks for your interest. This guide covers the setup, the rules the code follows and what CI checks.

## Setup

- **Node.js 24** or later (`.nvmrc`). Development only: the runtime never runs Node, it runs the TypeScript sources
  in Jint after bundling them with esbuild.
- `npm ci` installs the dev tooling: esbuild (pinned to the version the Orkeon runtime bundles with), TypeScript and
  the Node typings.
- [uv](https://docs.astral.sh/uv/), to run and test the speech MCP server (`mcp/whisper/`, Python).
- To run the agent: Docker, `orkeon-repl` (the `orkeon` Debian package or an Orkeon release archive), or an Orkeon
  checkout, the only one that works until Orkeon `1.0.0-rc.6` is published
  ([Getting started](docs/getting-started.md)).

```bash
npm ci
npm run check                 # unit tests, type check, bundle check, provenance gate, generated docs, docs parity
bash scripts/smoke-runtime.sh # the real REPL loads every command (needs a runtime, no API key)
```

## Layout and dependency rule

```text
src/
├── commands/   *.cmd.ts slash commands (entry points) + _lib/ (their use cases)
├── crews/      <name>/crew.ork.ts (entry point) + application/ + domain/
└── shared/     domain/ · application/ (ports.ts, services) · infrastructure/ (globals.ts, orkeon/ adapters)
tests/          support/ (doubles/, fixtures/, assertions/ shared across test files) · repository/ (architecture, test shape, command surface, versions) · scripts/ · config/
mcp/whisper/    the speech MCP server (Python, run by uv): whisper_mcp.py + tests/
```

Dependencies point inwards only, and `tests/repository/architecture.test.ts` fails on any import, and any use of a runtime
global, that breaks the rule:

- **domain**: pure types and deterministic functions. No IO, no runtime global. Imports domain only. Every module
  has its `*.test.ts` next to it.
- **application**: the use cases of a crew (`application/run-<crew>.ts`) and the shared services. Imports domain and
  the ports of `src/shared/application/ports.ts`, never infrastructure, never `commands/` nor an entry point: what it
  needs from the runtime, it receives as parameters typed by a port.
- **infrastructure**: `src/shared/infrastructure/globals.ts` is the only module that reads the runtime globals
  (`tools`, `agentBuilder`, `crewBuilder`, `inputs`); the adapters of `orkeon/` implement the ports over them, and
  `orkeon/wiring.ts` binds them.
- **entry points**: `crew.ork.ts` and `*.cmd.ts` parse the input, wire the adapters, call a use case and render the
  result; they hold no logic worth testing. Only the crew entry points import `globals.ts` or read the runtime
  globals; a command imports `wiring.ts` (or builds an adapter from its context), its use case in `commands/_lib/`
  imports nothing from `shared/infrastructure/`, and only a `*.cmd.ts` calls `defineCommand`. No `require()`
  anywhere: the sources are ES modules.

The ports, the adapters and the recipes (add a command, a crew, a tool, a permission mode, a prompt block, a config
key, a port) are in [docs/architecture.md](docs/architecture.md); the decision behind the layering in
[ADR 0001](docs/adr/0001-clean-architecture.md).

Runtime rules, enforced by the bundle check:

- Imports carry an explicit `.ts` extension (the runtime bundler resolves specifiers as written).
- No Node API (`node:fs`, `process`, ...) in `src/`, tests excepted: the bundle is built with `--platform=neutral`
  and a Node import fails it.
- A `*.cmd.ts` has no top-level `export`; only erasable TypeScript syntax (no `enum`, no `namespace`, no parameter
  property), since Node runs the tests by stripping the types.
- A new crew is a folder `src/crews/<name>/` with a `crew.ork.ts`; a folder starting with `_` is a development probe,
  never listed to users.

## Tests

- `node:test` and `node:assert` only. No mocking or assertion library.
- Test doubles live in `tests/support/doubles/`, one file per port: a class `Fake<Port>` (or `Stub<Port>`) that implements
  the port and exposes plain fields to configure it and to read what it received (`FakeFiles.files`,
  `FakeLlm.completes`). `FakeTools`, `FakeLlmFacade`, `FakeAgentContext` and `FakeScriptHost` stand in for the
  runtime objects, to test the adapters. Runtime code never imports `tests/`.
- Every module of `src/` is tested next to it, over the fakes: the domain modules, the use cases of a crew, the
  shared services and the command use cases of `commands/_lib/`. `tests/` holds the tests of the repository as a
  whole, by subject: `repository/` (the dependency rule, the test shape, the command surface, the prompt contract,
  the versions), `scripts/` (the scripts, the launchers, the install), `config/` (the example settings). Entry
  points are covered by the bundle check and the runtime smoke.
- No test depends on a clock, a network or an LLM.
- Every test is laid out **Arrange, Act, Assert**, the way Orkeon's are: three sections, each opened by its own
  comment line (`// Arrange`, `// Act`, `// Assert`), in that order, once each. One act per test: a second call
  under test is a second test. Cases of one behaviour are a table the test loops over (`for (const c of CASES) it(…)`),
  one test per case, like an xUnit `Theory`. `tests/repository/test-shape.test.ts` checks it on every test.
- A test file keeps its tests only. Beside `<module>.test.ts`:
  - `<module>.fixtures.ts` holds its data: the case tables, the sample texts, the builders of its inputs (a function
    with defaults, `planSheet({ steps: 2 })`), the expected values longer than a line. A text that is a file of its
    own (a sheet, a plan, a YAML) goes under `tests/fixtures/`;
  - `<module>.assertions.ts` holds its checks made of more than one native assertion, or used by more than one test
    (`assertCutBlock(block)`), built on `node:assert` with a message that says what is wrong.
  A scalar the Arrange reads in one line stays in the test. Runtime code never imports a `*.fixtures.ts` nor a
  `*.assertions.ts` (the architecture test).
- What several test files share, in whatever folder they sit, lives under `tests/support/`: `doubles/` (the fakes),
  `fixtures/` (the sample data, like the prompt catalogue and the memory entries), `assertions/` (the shared checks).
- A test's name says the behaviour and its condition, as a sentence: `cuts a name at 120 characters`.

## The checks

Run them all before a pull request; CI runs each of these as its own step:

```bash
npm test                                  # every *.test.ts, the architecture test included
npm run typecheck
npm run bundle:check                      # every entry point bundles with the runtime's esbuild flags
npm run check:provenance
node scripts/gen-commands-doc.mjs --check # docs/commands.md and docs/fr/commands.md match the commands
node scripts/check-docs-parity.mjs        # docs/fr/ mirrors docs/: every page has its twin, of the same shape
bash scripts/check-file-modes.sh          # scripts are committed executable
uv run --project mcp/whisper pytest mcp/whisper   # the Whisper MCP server, a fake model (CI: mcp and pytest in a venv)
```

`npm run check` runs the first six; `bash scripts/smoke-runtime.sh` loads every command in the real REPL, and
`runtime-smoke.yml` runs it in CI (not `ci.yml`). Both workflows run on pushes and pull requests to `main`: a pull
request stacked on another branch gets no check until it is retargeted to `main`.

## Original work only

Orkeon Code was designed by studying how agentic coding tools behave. Behaviour can be studied; text cannot be
copied. Prompts, documentation and comments are written for this project, in its own words: do not paste or closely
paraphrase another product's prompts, documentation or source, even when they are publicly available.
`npm run check:provenance` fails on markers of such material (`scripts/provenance-markers.json`), and
`scripts/provenance-baseline.json` lists the files still awaiting an original rewrite: it is empty, and CI keeps it
so (`--strict`).

To improve the harness (the main loop's prompt, the compaction summary, the tool guidance), a collection of
published agent system prompts is a useful reference for what such prompts cover and how they are structured:
https://github.com/Piebald-AI/claude-code-system-prompts. Read it to understand the behaviour a block must produce,
then write the block in this project's own words; the provenance gate accepts this link and no other marker.

A prompt change follows [ADR 0003](docs/adr/0003-prompts-from-a-behaviour-specification.md): the behaviour first, in
`docs/architecture.md` ("Prompt assembly"), then the text, then a marker phrase per rule in its test; render the
prompts before and after (`node scripts/render-prompts.mjs <dir>`) and read the diff. The baseline is empty and CI
runs the gate with `--strict`, so an adapted text cannot come back.

## Pull requests

- Branch from `main`: `feature/<slug>`, `fix/<slug>` or `chore/<slug>`.
- Commit messages in English, shaped `type(scope): summary` (`feat`, `fix`, `docs`, `test`, `chore`, `refactor`).
- `npm run check` green; a user-visible change has a `CHANGELOG.md` entry under `[Unreleased]`.
- A new or renamed command: `npm run docs:commands`.
- `README.md` and `README.fr.md` change together, and so do `docs/` and `docs/fr/`: a page changed in English is
  changed in French in the same pull request; a page added, renamed or removed is added, renamed or removed in both
  `toc.yml` and both indexes. The ADRs stay in English. `npm run check` verifies that the twins keep the same shape
  (`scripts/check-docs-parity.mjs`: every page has its twin, the same heading levels, the same code blocks, tables of
  the same length, the same navigation entries).
- Shell scripts and shebang scripts are committed executable: `git update-index --chmod=+x <path>`.
- Never commit a key: settings with secrets live in `config/*.local.json` (ignored) and keys in the environment.

## Releases

See [Development → Releasing](docs/development.md#releasing). Versions follow SemVer; the changelog follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
