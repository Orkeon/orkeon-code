# ADR 0026: Text apart from logic, by kind and by layer

- **Status**: accepted
- **Date**: 2026-11-10
- **Amends**: [ADR 0001](0001-clean-architecture.md)

## Context

Much of the natural-language text of `src/` is written inside the logic that uses it: the prompts sent to a model, the
lines shown to the user, and the values a writer and a reader must agree on (a heading the model is asked to write
and a parser looks for, a verdict word, a regular expression over a reply). A reader who opens a module to follow its
control flow wades through paragraphs; a reader who wants to review the wording has to find it between branches. The
worst files, counted by the guard below when it came in: `crews/main-loop/domain/prompt-assembly.ts` (139 literals
that read as prose), `crews/dev-plan/domain/plan-answer.ts` (86), `shared/domain/compaction.ts` (68),
`shared/domain/config-schema.ts` (62), `commands/_lib/settings/permissions.ts` and
`crews/dev-implement/application/run-dev-implement.ts` (49 each), `crews/dev-batches/application/run-dev-batches.ts`
(45); 2 371 literals over 240 files in all.

Seven modules already held one crew's prompt and nothing else, each under its own name (`turn-prompt.ts`,
`plan-prompt.ts`, `review-prompt.ts`...), and five pure-text modules held charters and rules (`*-charter.ts`,
`built-in-charters.ts`, `design-rules.ts`, `reading-rule.ts`).

## Decision

- **Text sits in text files, by kind.** Beside the modules that read it, a layer folder holds up to three:
  - `prompts.ts`: what a model reads (system prompts, instructions, tool descriptions, the descriptions of a schema's
    fields meant for the model);
  - `messages.ts`: what the user reads (usage, refusals, the text of an `Error` the user sees, status and report
    lines, hints);
  - `markers.ts`: the values a writer and a reader share (a heading a prompt asks for and a parser reads, a verdict
    word, a regular expression over text).

  A text with values in it becomes a function of those values (`refusedOnDefaultBranch(branch)`). A text file named
  after what it says, not numbered; past about 400 lines it may become a folder `prompts/<subject>.ts`.
- **By layer.** A text file sits in the layer folder of the module that reads it (`domain/`, `application/`,
  `shared/infrastructure/orkeon/`, `commands/_lib/<group>/`), subfolders included, so the dependency rule of ADR 0001
  holds unchanged: a domain module reads the text of `domain/` only. The text of a `*.cmd.ts` goes to
  `commands/_lib/<group>/messages.ts`, that of a `crew.ork.ts` to `crews/<crew>/application/messages.ts`.
- **TypeScript, not data files.** The bundle (`scripts/bundle-check.mjs`, esbuild in `platform: neutral`) loads
  `.ts`, `.tsx`, `.js` and `.mjs` only, and the runtime reads no file of its own beside the bundle: a text file is a
  module of constants and functions.
- **What stays inline.** Identifiers, configuration keys, paths and file names, shell commands, flags, the keys of a
  JSON schema, short words of an enumeration, the `description:` of each `*.cmd.ts` (read by
  `scripts/gen-commands-doc.mjs`), and the pure-text modules, which keep their names.
- **The renames.** The seven prompt modules become `prompts.ts` in their folder, their tests with them:
  `crews/{dev-change,dev-learn,dev-plan,dev-spec,dev-verify,main-loop}/application/prompts.ts` and
  `shared/domain/dev/prompts.ts`.
- **The guard.** `tests/repository/text-isolation.test.ts` reads every `src/**/*.ts` but the declaration files and the
  text files, through the TypeScript compiler: each string literal, each template without substitution, and the
  static parts of each template joined, leaving out module specifiers, literal types and property names. A literal is
  prose when it holds three words or more, or is longer than 60 characters with a space and at least one word; a word
  is a run of two letters or more, lower case after the first (an identifier in camelCase or a constant in capitals
  is no word), punctuation around. A shell command (the name of a command-line tool first, four words at most, no
  colon followed by a space) is no prose. Each exception names a file or a glob, the declaration or property that
  owns the literal, and why; an exception that matches nothing fails the test.
- **A ratchet, then strict.** `tests/repository/text-isolation-baseline.ts` gives each file the count it held when the
  guard came in: a file fails only above it, a new file starts at zero, and the count only goes down. The work is
  done in lots; the last one deletes the baseline and the guard then allows the named exceptions only.

## Consequences

- A logic module reads as control flow; its wording is reviewed in one place per layer, and the prompt contract
  (ADR 0003) keeps rendering the same prompts byte for byte, which `node scripts/render-prompts.mjs` before and after
  each lot shows.
- New prose in a logic file fails `npm run check` with the file, the line and the owner of the literal.
- The rule is a heuristic: a long regular expression or a sentence of two words can be misjudged. A literal wrongly
  flagged is written another way or named as an exception with its reason; the threshold is not loosened for one
  file.
- A module that moves its text keeps its exported names; a name another folder imports stays as a re-export without
  text until the last lot points the importers at the text file.

## Addendum: a text file holds text only

The first guard exempts the text files by name, so logic written in one goes unseen: a prompt builder that ran ports
in `Promise.all`, briefs that fit their parts to a budget in a loop, a cut kept in a `let`. The text file then holds
the control flow the rule meant to keep apart.

- **What a text file holds.** Constants and template functions: parameters in, text out, a ternary, an early return,
  a `.map` or a `.join` to render a list. It imports values from other text files and from `domain/` modules only;
  a type from anywhere.
- **What is logic.** An `async` function, `await`, a loop (`for`, `while`, `do`), a `switch`, a `try`, a class, a
  variable that changes (`let`, `var`), and a value imported from a port, an application or infrastructure module or a
  command use case. The budget of a brief, a cut to a cap, the choice of what to carry go to a logic module beside the
  text file, named after what it does (`turn-context.ts`, beside `crews/main-loop/application/prompts.ts`), which calls
  the template functions and so holds no prose.
- **The second check.** `tests/repository/text-isolation.test.ts` flags each such construct of a text file with its
  line and its owner (the declaration around it, or the name imported). Its exceptions are named like those of the
  prose, `{ file, name, reason }`, in `TEXT_FILE_EXCEPTIONS`, and one that matches nothing fails too. The guard reads
  and parses `src/` once for all its repository checks.
- **One text, one definition.** A message two folders show is written once, in the shared layer's `messages.ts`, and
  imported; a value a writer and a parser share is one constant of a `markers.ts` both import.
