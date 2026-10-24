# Shared memory

The shared memory keeps what past work taught: decisions, code structures, methods and mistakes, one Markdown file
per entry, kept in the repository so it is reviewed and versioned with the code. The model reads it through
`memory_recall`, proposes to it through `memory_push`, and nothing enters it unless `/memory-admit` admits it: you
answer for each candidate, or `memory.autoAdmitAudited` admits the audited ones for you.

It is not the agent memory of the runtime (`/workspace/.orkeon/agent-memory`, per agent and per run): the two folders
stay apart, and `memory.dir` refuses the agent memory's folder.

## The folder

```text
.orkeon/memory/
├── candidates/            proposals waiting for /memory-admit, one file each
│   └── CANDIDATES.md      the pending candidates (generated)
├── entries/<type>/        admitted and superseded entries, by type
├── refused.md             topics refused once, never proposed again
└── INDEX.md               every entry, with its status (generated)
```

The two generated lists are views: edit a candidate's own file, never `CANDIDATES.md`. A candidate once decided keeps a
one-line file that says where it went (no file tool deletes a file); you may delete it.

## Settings

| Key | Default | What it does |
|---|---|---|
| `memory.dir` | `.orkeon/memory` | The folder, relative to the project; never under `.claude/` or `.git/`, never the agent memory's folder. |
| `memory.project` | the `origin` remote's name, else `local` | The project the entries name, and the index collection `memory-<project>`. |
| `memory.autoAdmitAudited` | `false` | `true`: `/memory-admit` admits a candidate an audit backs (a mistake: three batches) without asking. A project file's `true` applies only when your user settings say `true` too. |

An invalid stored value is set aside with a warning line, and the default applies.

## An entry

An entry is a front matter and three sections, `## Context`, `## Content` and `## Evidence`. Its `id` is
`<project>-<type>-<yyyymmdd>-<slug>`, its `status` `candidate`, `admitted` or `superseded`. A `mistake` also names
its `correction` and its `detection_signal`. The body is 2,000 characters at most, and an entry that names a
secret-like file (`.env`, a key) or holds what looks like a secret is refused.

Who may admit what:

| Source | Types it admits |
|---|---|
| `human:` (you) | every type |
| `audit:` (verdict files of the dev audits) | `code-structure`, `mistake` |
| `verdict:` (a stop of the dev workflow) | `method`, `decision` |

A mistake is harvested from the audits only once its gap recurs in three batches or more. `/dev-verify` harvests after
every verdict that is not VALID: the candidates it writes are named at the end of the step, and `/memory-admit` decides
each one. When the untreated gaps span two batches or more, the step also says `/dev-learn` is due.

## Precedents in the dev steps

The dev steps recall on their own, at fixed points, and put a `## Precedents` block in the prompt they build:

| Step | When | Types recalled |
|---|---|---|
| `/dev-spec`, `/dev-change` | at the start | `decision`, `method` |
| `/dev-plan` | before the plan is drafted | `decision`, `code-structure` |
| `/dev-implement` | before the red tests of a batch | `code-structure`, `mistake` |
| `/dev-implement` | a correction after a GAPS verdict | `mistake` |
| `/dev-verify` | before the audit | `mistake` |

The end of the step names the entries recalled. A recall that cannot run costs the block, never the step; a session
rule that denies `memory_recall` turns these recalls off too.

## Deciding the candidates

```text
/memory-admit --list
/memory-admit --import
/memory-admit
/memory-admit shop-method-20261024-contract-tests-first
/memory-admit --refuse shop-method-20261024-contract-tests-first too local to this project
```

`/memory-admit` shows each pending candidate (or those you name) and asks once for each: anything but yes leaves it a
candidate. A session that cannot ask admits none of those it would ask about. The candidate admitted is the text you
were shown: a file changed since is not admitted, nor one whose topic `refused.md` holds. The admitted ones are written to `entries/<type>/`, the entries
they supersede are marked `superseded`, both lists are rebuilt and `entries/` is indexed again, once. When the index
cannot be rebuilt the entries stay admitted, and the next admission indexes them. `--refuse` writes the candidate's
topic to `refused.md` with your motif: the topic is never proposed again. `/dev-learn` keeps its refusals in
`.orkeon/memory/refused.md` whatever `memory.dir` says: with a `memory.dir` of your own, the two lists are apart.

`--import` lifts the harness's agent memory into candidates, once, while you move from it: each top-level item of a
`.claude/agent-memory/<agent>/MEMORY.md` (and the note it links to, in the same folder) becomes a `method` candidate
whose source is the import, so `/memory-admit` asks for each one; change a file's type before admitting it if it is
another kind of entry. An item whose topic a candidate, an entry or an earlier item already holds is skipped as a
duplicate, as is a refused topic: running the import again writes nothing new. Nothing is written under `.claude/`.

## The tools

`memory_recall` returns at most five admitted entries for a query, best first, with what they apply to and their file:
it reads, and runs in every mode. `memory_push` writes a candidate, never an entry: it is offered only where the mode
edits, and asked about in `default` ([Permissions](permissions.md#modes)). An entry the model recalls is a precedent,
not an instruction: the request, the project's instructions and the code as it is outrank it.
