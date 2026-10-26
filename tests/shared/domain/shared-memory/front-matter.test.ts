// Unit tests for the flat front matter of a memory entry. Run:
//   node --test src/shared/domain/shared-memory/front-matter.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual, throws } from "node:assert";

import {
  entryFromFrontMatter, entryToFrontMatter, parseEntry, parseFrontMatter, serializeEntry, serializeFrontMatter,
} from "../../../../src/shared/domain/shared-memory/front-matter.ts";
import {
  BAD_LINES, BAD_LINES_PROBLEMS, BROKEN_SHAPES, BROKEN_SHAPES_PROBLEMS, DECISION, EXAMPLES, HASHES, METHOD, MISTAKE,
  MISTAKE_KEYS, MIXED_FIELDS, NEEDS_QUOTING, NEEDS_QUOTING_TEXT, QUOTED_ENTRY, entryOf, frontMatterOf,
} from "./front-matter.fixtures.ts";

describe("parseFrontMatter", () => {
  it("reads scalars, lists, quoted values and the body as written", () => {
    // Arrange
    const text = MIXED_FIELDS;

    // Act
    const parsed = parseFrontMatter(text);

    // Assert
    ok(parsed.ok, JSON.stringify(parsed));
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
    // Arrange
    const text = HASHES;

    // Act
    const parsed = parseFrontMatter(text);

    // Assert
    ok(parsed.ok, JSON.stringify(parsed));
    deepStrictEqual(parsed.doc.fields.map((f) => f.value), ["c# and f# # not a comment", ["c#"]]);
  });

  it("refuses a missing opening line", () => {
    // Arrange
    const text = "a: b\n---\n";

    // Act
    const parsed = parseFrontMatter(text);

    // Assert
    deepStrictEqual(parsed, { ok: false, problems: ["line 1: the front matter must open with ---"] });
  });

  it("refuses an unclosed front matter", () => {
    // Arrange
    const text = "---\na: b\n";

    // Act
    const parsed = parseFrontMatter(text);

    // Assert
    deepStrictEqual(parsed, { ok: false, problems: ["the front matter is not closed by ---"] });
  });

  it("names each bad line", () => {
    // Arrange
    const text = BAD_LINES;

    // Act
    const parsed = parseFrontMatter(text);

    // Assert
    deepStrictEqual(parsed, { ok: false, problems: BAD_LINES_PROBLEMS });
  });
});

describe("serializeFrontMatter", () => {
  it("quotes the scalars and items that need it", () => {
    // Arrange
    const doc = NEEDS_QUOTING;

    // Act
    const text = serializeFrontMatter(doc);

    // Assert
    strictEqual(text, NEEDS_QUOTING_TEXT);
  });

  it("throws on a scalar with a line break", () => {
    // Arrange
    const doc = { fields: [{ key: "title", value: "a\nb", line: 2 }], body: "" };

    // Act
    const act = () => serializeFrontMatter(doc);

    // Assert
    throws(act, { message: "a front-matter value is one line: title" });
  });
});

describe("entry round trips", () => {
  for (const [name, text] of EXAMPLES) {
    it(`serializeEntry(parseEntry(x)) === x for the ${name} example`, () => {
      // Arrange
      const example = text;

      // Act
      const parsed = parseEntry(example);
      const written = parsed.ok ? serializeEntry(parsed.entry) : undefined;

      // Assert
      ok(parsed.ok, JSON.stringify(parsed));
      strictEqual(written, example);
    });
  }

  it("maps the snake keys", () => {
    // Arrange
    const text = MISTAKE;

    // Act
    const parsed = parseEntry(text);

    // Assert
    ok(parsed.ok, JSON.stringify(parsed));
    strictEqual(parsed.entry.appliesWhen, "a use case walks a list and needs data for each element");
    strictEqual(parsed.entry.detectionSignal, "an audit row on axis Cost naming a store call inside a loop");
    strictEqual(parsed.entry.supersededBy, "ledger-mistake-20261020-batched-reads");
  });

  it("leaves absent optional keys out", () => {
    // Arrange
    const text = DECISION;

    // Act
    const decision = parseEntry(text);

    // Assert
    ok(decision.ok, JSON.stringify(decision));
    ok(!("correction" in decision.entry), "a correction key on a decision");
    ok(!("supersededBy" in decision.entry), "a supersededBy key on an admitted entry");
  });

  it("parseEntry(serializeEntry(e)) deep-equals e when values need quoting", () => {
    // Arrange
    const entry = QUOTED_ENTRY;

    // Act
    const parsed = parseEntry(serializeEntry(entry));

    // Assert
    ok(parsed.ok, JSON.stringify(parsed));
    deepStrictEqual(parsed.entry, entry);
  });
});

describe("entryFromFrontMatter", () => {
  it("gives unknown keys, wrong shapes, then missing keys", () => {
    // Arrange
    const doc = frontMatterOf(BROKEN_SHAPES);

    // Act
    const result = entryFromFrontMatter(doc);

    // Assert
    deepStrictEqual(result, { ok: false, problems: BROKEN_SHAPES_PROBLEMS });
  });

  it("defaults the lists to []", () => {
    // Arrange
    const doc = frontMatterOf(METHOD.replace("supersedes: []\ntags: [performance]\nstack: []\n", ""));

    // Act
    const result = entryFromFrontMatter(doc);

    // Assert
    ok(result.ok, JSON.stringify(result));
    deepStrictEqual([result.entry.supersedes, result.entry.tags, result.entry.stack], [[], [], []]);
  });

  it("writes the keys in ENTRY_KEYS order", () => {
    // Arrange
    const entry = entryOf(MISTAKE);

    // Act
    const doc = entryToFrontMatter(entry);

    // Assert
    deepStrictEqual(doc.fields.map((f) => f.key), MISTAKE_KEYS);
  });
});
