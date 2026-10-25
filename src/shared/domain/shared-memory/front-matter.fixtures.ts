// The front matters and entries the flat front matter is tested on.
import type { FrontMatter } from "./front-matter.ts";
import { parseEntry, parseFrontMatter } from "./front-matter.ts";
import type { MemoryEntry } from "./entry.ts";

/** A decision entry, admitted, of project ledger. */
export const DECISION = `---
id: ledger-decision-20261003-amounts-in-cents
type: decision
title: Amounts are kept as whole cents in an integer column
project: ledger
date: 2026-10-03
topic: amount-storage
applies_when: a module stores or adds up prices
rationale: float sums drifted by a cent on long reports
source: human:2026-10-03 review of the storage plan
status: admitted
supersedes: []
tags: [money, storage]
stack: [typescript, sqlite]
---
## Context
Reports summed prices held as floats.

## Content
Every amount is an integer count of cents, converted at the edges only.

## Evidence
\`src/ledger/amount.ts:12\` holds the conversion.
`;

/** A code-structure entry an audit backs. */
export const STRUCTURE = `---
id: orkeon-code-code-structure-20261009-ports-and-fakes
type: code-structure
title: A runtime tool is reached through a port with a fake beside the tests
project: orkeon-code
date: 2026-10-09
topic: runtime-tool-access
applies_when: code under the runtime needs a host tool
rationale: the use cases then run in Node without the host globals
source: audit:workbench/ports/PORTS-VERIFY-F2.md
status: admitted
supersedes: []
tags: [layering, testing]
stack: [typescript]
---
## Context
Use cases called host globals directly and could not be tested.

## Content
A port in the application layer, an adapter in infrastructure, a fake under tests/support.

## Evidence
src/shared/application/ports.ts:36 declares the file port.
`;

/** A method candidate a verdict backs, its stack empty. */
export const METHOD = `---
id: ledger-method-20261011-time-before-and-after
type: method
title: Time a slow path before and after the change, with one command
project: ledger
date: 2026-10-11
topic: speed-change-method
applies_when: a change is argued for by speed
rationale: two claimed gains vanished when timed again
source: verdict:workbench/speed/SPEED-VERIFY-F1.md
status: candidate
supersedes: []
tags: [performance]
stack: []
---
## Context
Speed claims were made from one run.

## Content
The same command is timed on both sides of the change and the figures go in the batch notes.

## Evidence
The verdict row of batch F1 on axis Cost.
`;

/** A superseded mistake, with its correction, signal and successor. */
export const MISTAKE = `---
id: ledger-mistake-20261014-query-per-item
type: mistake
title: One store query per item of a request
project: ledger
date: 2026-10-14
topic: query-per-item
applies_when: a use case walks a list and needs data for each element
rationale: three batches were flagged for it on axis Cost
correction: load the rows for the whole key set once, then look each up in a map
detection_signal: an audit row on axis Cost naming a store call inside a loop
source: audit:workbench/orders/ORDERS-VERIFY-F2.md
status: superseded
supersedes: [ledger-mistake-20261001-loop-query]
superseded_by: ledger-mistake-20261020-batched-reads
tags: [cost, data-access]
stack: [typescript]
---
## Context
Order lines were priced one query at a time.

## Content
The prices are read in one call keyed by the set of product ids.

## Evidence
\`src/orders/price.ts:40\` loops over the lines.
`;

/** The four examples, by type. */
export const EXAMPLES: ReadonlyArray<readonly [string, string]> =
  [["decision", DECISION], ["code-structure", STRUCTURE], ["method", METHOD], ["mistake", MISTAKE]];

/** Scalars, an empty list, a list with a quoted item, a quoted scalar, an empty value, then a body. */
export const MIXED_FIELDS = "---\na: plain text\nb: []\nc: [x, \"y, z\", w]\nd: \"q: r\"\ne:\n---\nbody\n";

/** A # in a scalar and in a list item. */
export const HASHES = "---\nlang: c# and f# # not a comment\ntags: [c#]\n---\n";

/** A line that is no key, a key without its space, a duplicate key, an unclosed list, two bad quoted values. */
export const BAD_LINES = "---\nNot a key\na:b\nk: 1\nk: 2\nl: [x, y\nq: \"open\nr: [\"x\" y]\n---\n";

/** The problems BAD_LINES gives. */
export const BAD_LINES_PROBLEMS = [
  "line 2: 'Not a key' is not key: value",
  "line 3: 'a:b' is not key: value",
  "line 5: duplicate key 'k'",
  "line 6: unclosed list",
  "line 7: bad quoted value",
  "line 8: bad quoted value",
];

/** Values that need quoting: empty, opening a list, padded, holding ": ", and list items holding a comma or empty. */
export const NEEDS_QUOTING: FrontMatter = {
  fields: [
    { key: "a", value: "" }, { key: "b", value: "[x" }, { key: "c", value: " pad" }, { key: "d", value: "a: b" },
    { key: "e", value: "plain, text" }, { key: "f", value: ["a, b", "c#", ""] },
  ].map((f, i) => ({ ...f, line: i + 2 })),
  body: "",
};

/** NEEDS_QUOTING serialized. */
export const NEEDS_QUOTING_TEXT = "---\na: \"\"\nb: \"[x\"\nc: \" pad\"\nd: \"a: b\"\ne: plain, text\nf: [\"a, b\", c#, \"\"]\n---\n";

/** An entry whose title, applies_when, rationale and tags need quoting. */
export const QUOTED_ENTRY: MemoryEntry = {
  id: "ledger-method-20261012-quoted", type: "method", title: "[x", project: "ledger", date: "2026-10-12",
  topic: "quoting", appliesWhen: "a: b", rationale: " leading space", source: "human:2026-10-12 note",
  status: "admitted", supersedes: [], tags: ["c#", "a, b"], stack: [], body: "## Context\n",
};

/** The front matter of `text`, which must parse. */
export function frontMatterOf(text: string): FrontMatter {
  const parsed = parseFrontMatter(text);
  if (!parsed.ok) throw new Error(`the fixture does not parse: ${parsed.problems.join("; ")}`);
  return parsed.doc;
}

/** The entry of `text`, which must parse. */
export function entryOf(text: string): MemoryEntry {
  const parsed = parseEntry(text);
  if (!parsed.ok) throw new Error(`the fixture does not parse: ${JSON.stringify(parsed)}`);
  return parsed.entry;
}

/** A front matter with an id that is a list, an unknown key, tags that are text, and most keys missing. */
export const BROKEN_SHAPES = "---\nid: [a]\nextra: x\ntags: c\n---\n";

/** The problems BROKEN_SHAPES gives: unknown keys, wrong shapes, then missing keys. */
export const BROKEN_SHAPES_PROBLEMS = [
  "id must be text", "unknown key 'extra'", "tags must be a list",
  "missing key 'type'", "missing key 'title'", "missing key 'project'", "missing key 'date'", "missing key 'topic'",
  "missing key 'applies_when'", "missing key 'rationale'", "missing key 'source'", "missing key 'status'",
];

/** The keys of a full mistake, in ENTRY_KEYS order. */
export const MISTAKE_KEYS = [
  "id", "type", "title", "project", "date", "topic", "applies_when", "rationale", "correction", "detection_signal",
  "source", "status", "supersedes", "superseded_by", "tags", "stack",
];
