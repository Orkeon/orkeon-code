# ADR 0001: Ports, adapters and entry points as composition roots

- **Status**: accepted
- **Date**: 2026-10-16

## Context

Orkeon Code runs inside the Orkeon runtime, which sets hard limits on the TypeScript it executes: each command and
each crew is bundled alone by esbuild and evaluated by Jint, with no Node API, no npm package and no timer; nothing
is shared between bundles at run time, the session's state bag being the only state commands and crews have in
common; a crew's module scope is synchronous and sees only its `inputs`; Node runs the tests by stripping the types,
so only erasable TypeScript syntax is allowed.

The first version, extracted from an experiment, let any module reach the runtime: 27 of the 57 commands imported
the `tools` global (re-exported untyped), as did 15 crew files and the shared services, and the agent context `ctx`
travelled untyped into the use cases. Two consequences followed:

- **Nothing above the pure domain could be tested.** Importing a module that reached `globals.ts` threw
  `ReferenceError: tools is not defined` in Node: no test covered a command, a crew's use case, the session and
  config services or the compaction.
- **Every reader repeated the runtime's quirks.** The session state was read as JSON in four places, the field
  casing of the tool results (`messages` or `Messages`) was handled inline in every crew, the read-only notion of
  a permission mode was encoded three times, and an import cycle between the session and config services was
  hidden behind a deferred `import()`.

## Decision

- **Layers with one dependency rule.** `domain/` holds pure code and imports only domain; `application/` holds the
  use cases and services and imports domain and the ports, never infrastructure; `shared/infrastructure/` is the
  only code that touches the runtime. `tests/architecture.test.ts` (now `tests/repository/architecture.test.ts`) parses every
  import of `src/` and fails on any that breaks the rule.
- **Ports named after the need.** `src/shared/application/ports.ts` declares what the application needs (`Shell`,
  `Files`, `SessionStore`, `Llm`...). Each port has one Orkeon adapter in `src/shared/infrastructure/orkeon/`, the
  only code that calls the runtime for it and reads its results, whatever their casing.
- **Every entry point is a composition root.** A `*.cmd.ts` or `crew.ork.ts` parses its input, builds the adapters
  it needs (`wiring.ts` for those bound to the `tools` global, the agent or command context for the others), passes
  them to a use case, and renders the result. A use case receives its ports as parameters.
- **Hand-written test doubles.** `tests/support/` holds one `Fake*` class per port, with plain fields to configure
  and inspect, plus stand-ins for the runtime objects the adapters take. Runtime code never imports them. (Since
  then the tests of `src/` moved out of it: `tests/crews/`, `tests/shared/` and `tests/commands/` mirror `src/`.)

## Consequences

- Every use case, service and adapter runs under `node --test`: the suite went from 436 tests, none of them on a
  command, a crew's use case or a shared service, to 745 when the restructuring ended, which cover every command family, every crew's use
  case, the services and the adapters.
- The runtime's quirks live in one place each: a change of a tool's result shape touches one adapter and its test.
- An entry point repeats a few lines of wiring that a container would hide, and shows at a glance what it reaches.
- A new runtime capability needs a port, an adapter and a fake before the application can use it; a port lands with
  its first caller, never ahead of it.
- The rule is checked statically, on the imports and on the runtime globals a file reads (an identifier it does not
  declare, a `globalThis.<name>`): a module outside `shared/infrastructure/` and the crew entry points that calls
  `tools` directly fails the test, though the generated typings let it type-check.

## Alternatives considered

- **One registry shared across bundles**, where commands and crews would look their services up: impossible. Each
  entry point is a separate bundle evaluated on its own; no object survives from one to another, and a registry
  rebuilt in every bundle is only the wiring under another name.
- **A dependency-injection container**: overkill. Under one bundle per entry point, each composition root builds a
  handful of adapters once; a container would add a library (none can be loaded), or a hand-written resolver, and
  indirection, to replace a few explicit lines.
- **Leaving it as is**: untestable. Any module reaching the runtime globals fails to load in Node, so the use cases
  could only be checked by running the REPL against a model, and the duplicated reads would keep drifting apart.
