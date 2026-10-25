# CLAUDE.md

Orkeon Code is an agentic coding assistant written in TypeScript and run by the Orkeon runtime: the sources are
bundled by esbuild and executed in Jint, never in Node. Node 24 is the development tool only (tests, type check,
bundle check). [CONTRIBUTING.md](CONTRIBUTING.md) is the full guide and
[docs/architecture.md](docs/architecture.md) the architecture; this file holds the rules that are never skipped.

## Commands

Node comes from nvm: `source ~/.nvm/nvm.sh` first, in the same shell line.

```bash
npm run check                          # tests, type check, bundle check, provenance, generated docs, docs parity
npm test                               # every *.test.ts under src/ and tests/ (scripts/run-tests.mjs)
node --test src/path/to/module.test.ts # one test file
npm run typecheck
npm run docs:commands                  # after a command is added or renamed
```

`npm run check` is green before every commit.

## Rules

### Clean architecture: decide the layer before writing a line

Dependencies point inwards only. `tests/architecture.test.ts` fails on any import, or any use of a runtime global,
that breaks the rule; never weaken it to make a change pass, move the code instead.

| Layer | What it holds | May import |
| --- | --- | --- |
| **domain** (`*/domain/`) | pure types and deterministic functions: no IO, no clock, no runtime global | domain only |
| **application** (`*/application/`) | the use cases (`run-<crew>.ts`) and shared services | domain and the ports of `src/shared/application/ports.ts` |
| **infrastructure** (`src/shared/infrastructure/`) | `globals.ts` (the only reader of `tools`, `agentBuilder`, `crewBuilder`, `inputs`), the `orkeon/` adapters, `orkeon/wiring.ts` | everything inside |
| **entry points** (`crew.ork.ts`, `*.cmd.ts`) | parse the input, wire the adapters, call one use case, render the result | no logic worth testing |
| **command use cases** (`src/commands/_lib/`) | the logic of a command | never `shared/infrastructure/` |

- Application never imports infrastructure: what it needs from the runtime it receives as a parameter typed by a
  port. A new need of the runtime is a new port in `ports.ts`, an adapter in `orkeon/`, a fake in `tests/support/`.
- Domain and application never import `commands/` nor an entry point. Only the crew entry points import
  `globals.ts`; only a `*.cmd.ts` calls `defineCommand`.
- No import cycle. Relative imports name their `.ts` file. No `require()`, no Node API in `src/` outside tests.
- Logic found in an entry point or an adapter is moved into domain (when pure) or application (when it orchestrates
  ports), then tested there.
- Before adding a file, answer: is it pure (domain), does it orchestrate ports (application), does it touch the
  runtime (infrastructure)? Put it there, next to its siblings.

### Tests: Arrange, Act, Assert, the data and checks beside them

The convention is Orkeon's (`tests/` of github.com/Orkeon/orkeon), adapted to `node:test`.

- `node:test` and `node:assert` only. No mocking, spy or fluent assertion library.
- **Every test has three sections**, each opened by its own comment line, once each, in order:

  ```ts
  it("stops at 20 failed tests", () => {
    // Arrange
    const output = tapRunFailing(30);

    // Act
    const failed = failedTests(output);

    // Assert
    strictEqual(failed.length, 20);
  });
  ```

- **One act per test.** A second call under test is a second test. Cases of one behaviour are a table the file loops
  over, one test per case (`for (const c of CASES) it(c.name, …)`), like an xUnit `Theory`.
- **A test file holds its tests only.** Beside `<module>.test.ts`:
  - `<module>.fixtures.ts`: the case tables, sample texts, builders with defaults (`planSheet({ steps: 2 })`) and
    expected values longer than a line. A text that is a file of its own (a sheet, a plan, a YAML) goes under
    `tests/fixtures/`.
  - `<module>.assertions.ts`: every check made of more than one native assertion, or used by more than one test
    (`assertCutBlock(block)`), built on `node:assert` with a message that says what is wrong.
  - A scalar the Arrange reads in one line stays in the test. No `ok(text.includes(…))` piles: one assertion helper
    that names the expectation.
- **Doubles are hand-written**, one per port: a class `Fake<Port>` (or `Stub<Port>`) that implements the port and
  exposes plain fields to configure it and to read what it received. They live in `tests/support/` (the shared
  memory's in `tests/doubles/`). Reuse one before writing one; never redefine a port's fake inside a test file.
- **Where a test goes**: a domain module, a use case or a shared service is tested next to it; a command use case of
  `commands/_lib/` in `tests/commands-<family>.test.ts`; entry points are covered by the bundle check and the smoke.
- A test's name is the behaviour and its condition, as a sentence: `cuts a name at 120 characters`.
- No test depends on a clock, a network or an LLM. Runtime code never imports `tests/`, a `*.fixtures.ts` nor a
  `*.assertions.ts`.
- `tests/test-shape.test.ts` checks the shape of every test. `tests/test-shape.pending.ts` lists the files written
  before the convention: never add a file to it. A pending file you touch is converted whole, then removed from the
  list (the test fails while a converted file stays listed).
- A behaviour added or changed gets its new test; never append assertions to an existing test to cover it.

### Runtime rules (bundle check)

- A `*.cmd.ts` has no top-level `export`. Only erasable TypeScript: no `enum`, no `namespace`, no parameter property.
- A crew is a folder `src/crews/<name>/` with a `crew.ork.ts`; a folder starting with `_` is a development probe.

### Other rules

- Commits in English, `type(scope): summary`. A user-visible change has a `CHANGELOG.md` entry under `[Unreleased]`.
- `docs/` and `docs/fr/` change together, as do `README.md` and `README.fr.md` (the docs parity check).
- Prompts and documentation are written in this project's own words (`npm run check:provenance`). A prompt change
  follows [ADR 0003](docs/adr/0003-prompts-from-a-behaviour-specification.md): the behaviour in
  `docs/architecture.md` first, then the text, then a marker per rule in its test.
- Never commit a key: secrets live in `config/*.local.json` (ignored) and keys in the environment.

## Map

```text
src/
├── commands/   *.cmd.ts (entry points) + _lib/ (their use cases)
├── crews/      <name>/crew.ork.ts (entry point) + application/ + domain/
└── shared/     domain/ · application/ (ports.ts, services) · infrastructure/ (globals.ts, orkeon/ adapters, wiring.ts)
tests/          support/ (doubles) · fixtures/ (file-like texts) · architecture · test shape · commands-<family>
mcp/whisper/    the speech MCP server (Python, uv)
docs/           architecture.md, adr/ (0001 clean architecture), commands.md, fr/ (the French twins)
```
