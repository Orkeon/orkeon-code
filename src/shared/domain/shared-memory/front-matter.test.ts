// Unit tests for the flat front matter of a memory entry. Run:
//   node --test src/shared/domain/shared-memory/front-matter.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual, throws } from "node:assert";

import {
  entryFromFrontMatter, entryToFrontMatter, parseEntry, parseFrontMatter, serializeEntry, serializeFrontMatter,
} from "./front-matter.ts";
import type { FrontMatter } from "./front-matter.ts";
import type { MemoryEntry } from "./entry.ts";

const DECISION = `---
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

const STRUCTURE = `---
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

const METHOD = `---
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

const MISTAKE = `---
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

describe("parseFrontMatter", () => {
  it("reads scalars, lists, quoted values and the body as written", () => {
    const parsed = parseFrontMatter("---\na: plain text\nb: []\nc: [x, \"y, z\", w]\nd: \"q: r\"\ne:\n---\nbody\n");
    ok(parsed.ok);
    deepStrictEqual(parsed.doc.fields, [
      { key: "a", value: "plain text", line: 2 },
      { key: "b", value: [], line: 3 },
      { key: "c", value: ["x", "y, z", "w"], line: 4 },
      { key: "d", value: "q: r", line: 5 },
      { key: "e", value: "", line: 6 },
    ]);
    strictEqual(parsed.doc.body, "body\n");
  });
  it("keeps a # as text", () => {
    const parsed = parseFrontMatter("---\nlang: c# and f# # not a comment\ntags: [c#]\n---\n");
    ok(parsed.ok);
    deepStrictEqual(parsed.doc.fields.map((f) => f.value), ["c# and f# # not a comment", ["c#"]]);
  });
  it("refuses a missing opening line", () => {
    deepStrictEqual(parseFrontMatter("a: b\n---\n"), { ok: false, problems: ["line 1: the front matter must open with ---"] });
  });
  it("refuses an unclosed front matter", () => {
    deepStrictEqual(parseFrontMatter("---\na: b\n"), { ok: false, problems: ["the front matter is not closed by ---"] });
  });
  it("names each bad line", () => {
    const parsed = parseFrontMatter("---\nNot a key\na:b\nk: 1\nk: 2\nl: [x, y\nq: \"open\nr: [\"x\" y]\n---\n");
    deepStrictEqual(parsed, {
      ok: false,
      problems: [
        "line 2: 'Not a key' is not key: value",
        "line 3: 'a:b' is not key: value",
        "line 5: duplicate key 'k'",
        "line 6: unclosed list",
        "line 7: bad quoted value",
        "line 8: bad quoted value",
      ],
    });
  });
});

describe("serializeFrontMatter", () => {
  it("quotes the scalars and items that need it", () => {
    const doc: FrontMatter = {
      fields: [
        { key: "a", value: "" }, { key: "b", value: "[x" }, { key: "c", value: " pad" }, { key: "d", value: "a: b" },
        { key: "e", value: "plain, text" }, { key: "f", value: ["a, b", "c#", ""] },
      ].map((f, i) => ({ ...f, line: i + 2 })),
      body: "",
    };
    strictEqual(serializeFrontMatter(doc),
      "---\na: \"\"\nb: \"[x\"\nc: \" pad\"\nd: \"a: b\"\ne: plain, text\nf: [\"a, b\", c#, \"\"]\n---\n");
  });
  it("throws on a scalar with a line break", () => {
    throws(() => serializeFrontMatter({ fields: [{ key: "title", value: "a\nb", line: 2 }], body: "" }),
      { message: "a front-matter value is one line: title" });
  });
});

describe("entry round trips", () => {
  for (const [name, text] of [["decision", DECISION], ["code-structure", STRUCTURE], ["method", METHOD], ["mistake", MISTAKE]]) {
    it(`serializeEntry(parseEntry(x)) === x for the ${name} example`, () => {
      const parsed = parseEntry(text);
      ok(parsed.ok, JSON.stringify(parsed));
      strictEqual(serializeEntry(parsed.entry), text);
    });
  }
  it("maps the snake keys and leaves absent optional keys out", () => {
    const parsed = parseEntry(MISTAKE);
    ok(parsed.ok);
    strictEqual(parsed.entry.appliesWhen, "a use case walks a list and needs data for each element");
    strictEqual(parsed.entry.detectionSignal, "an audit row on axis Cost naming a store call inside a loop");
    strictEqual(parsed.entry.supersededBy, "ledger-mistake-20261020-batched-reads");
    const decision = parseEntry(DECISION);
    ok(decision.ok);
    ok(!("correction" in decision.entry) && !("supersededBy" in decision.entry));
  });
  it("parseEntry(serializeEntry(e)) deep-equals e when values need quoting", () => {
    const entry: MemoryEntry = {
      id: "ledger-method-20261012-quoted", type: "method", title: "[x", project: "ledger", date: "2026-10-12",
      topic: "quoting", appliesWhen: "a: b", rationale: " leading space", source: "human:2026-10-12 note",
      status: "admitted", supersedes: [], tags: ["c#", "a, b"], stack: [], body: "## Context\n",
    };
    const parsed = parseEntry(serializeEntry(entry));
    ok(parsed.ok);
    deepStrictEqual(parsed.entry, entry);
  });
});

describe("entryFromFrontMatter", () => {
  const doc = (text: string): FrontMatter => {
    const parsed = parseFrontMatter(text);
    ok(parsed.ok);
    return parsed.doc;
  };
  it("gives unknown keys, wrong shapes, then missing keys", () => {
    const result = entryFromFrontMatter(doc("---\nid: [a]\nextra: x\ntags: c\n---\n"));
    deepStrictEqual(result, {
      ok: false,
      problems: [
        "id must be text", "unknown key 'extra'", "tags must be a list",
        "missing key 'type'", "missing key 'title'", "missing key 'project'", "missing key 'date'", "missing key 'topic'",
        "missing key 'applies_when'", "missing key 'rationale'", "missing key 'source'", "missing key 'status'",
      ],
    });
  });
  it("defaults the lists to []", () => {
    const text = METHOD.replace("supersedes: []\ntags: [performance]\nstack: []\n", "");
    const result = entryFromFrontMatter(doc(text));
    ok(result.ok);
    deepStrictEqual([result.entry.supersedes, result.entry.tags, result.entry.stack], [[], [], []]);
  });
  it("writes the keys in ENTRY_KEYS order", () => {
    const parsed = parseEntry(MISTAKE);
    ok(parsed.ok);
    deepStrictEqual(entryToFrontMatter(parsed.entry).fields.map((f) => f.key), [
      "id", "type", "title", "project", "date", "topic", "applies_when", "rationale", "correction", "detection_signal",
      "source", "status", "supersedes", "superseded_by", "tags", "stack",
    ]);
  });
});
