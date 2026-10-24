// Unit tests for the memory entry checks. Run:
//   node --test src/shared/domain/shared-memory/entry.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { ENTRY_KEYS, ENTRY_TYPES, entryIdPrefix, entryProblems } from "./entry.ts";
import type { EntryType, MemoryEntry } from "./entry.ts";

const BODY = "## Context\nA sentence of context.\n\n## Content\nThe rule itself.\n\n## Evidence\n`src/app/main.ts:10`\n";

function base(type: EntryType, over: Partial<MemoryEntry> = {}): MemoryEntry {
  const entry: MemoryEntry = {
    id: `shop-${type}-20261022-sample-slug`, type, title: "A short title", project: "shop", date: "2026-10-22",
    topic: "sample-topic", appliesWhen: "a module does the thing", rationale: "it went wrong before",
    source: "audit:workbench/shop/SHOP-VERIFY-F1.md", status: "admitted", supersedes: [], tags: ["testing"],
    stack: ["typescript"], body: BODY,
  };
  if (type === "mistake") {
    entry.correction = "do the other thing";
    entry.detectionSignal = "a red test on the edge case";
  }
  return { ...entry, ...over };
}

describe("entryIdPrefix", () => {
  it("joins project, type and the compact date", () => {
    strictEqual(entryIdPrefix("shop", "code-structure", "2026-10-22"), "shop-code-structure-20261022-");
  });
});

describe("entryProblems", () => {
  for (const type of ENTRY_TYPES) {
    it(`accepts a valid ${type}`, () => deepStrictEqual(entryProblems(base(type)), []));
  }

  const rows: Array<[string, Partial<MemoryEntry>, string, EntryType?]> = [
    ["id without its prefix", { id: "shop-decision-20261021-sample" },
      "id 'shop-decision-20261021-sample' is not shop-decision-20261022-<slug>"],
    ["id not kebab", { id: "shop-decision-20261022-Bad_Slug" },
      "id 'shop-decision-20261022-Bad_Slug' is not shop-decision-20261022-<slug>"],
    ["id with no slug", { id: "shop-decision-20261022-" }, "id 'shop-decision-20261022-' is not shop-decision-20261022-<slug>"],
    ["title empty", { title: "" }, "title must be one line of 1 to 90 characters"],
    ["title on two lines", { title: "a\nb" }, "title must be one line of 1 to 90 characters"],
    ["title too long", { title: "x".repeat(91) }, "title must be one line of 1 to 90 characters"],
    ["topic too long", { topic: "a".repeat(61) }, `topic '${"a".repeat(61)}' is not a kebab slug of at most 60 characters`],
    ["topic not kebab", { topic: "Some Topic" }, "topic 'Some Topic' is not a kebab slug of at most 60 characters"],
    ["applies_when empty", { appliesWhen: " " }, "applies_when is empty"],
    ["rationale empty", { rationale: "" }, "rationale is empty"],
    ["mistake without correction", { correction: undefined }, "a mistake needs correction", "mistake"],
    ["mistake without detection_signal", { detectionSignal: "" }, "a mistake needs detection_signal", "mistake"],
    ["correction on a decision", { correction: "x" }, "correction is for a mistake only"],
    ["detection_signal on a method", { detectionSignal: "x" }, "detection_signal is for a mistake only", "method"],
    ["source without a kind", { source: "workbench/x.md" }, "source must start with verdict:, audit: or human:"],
    ["source with an empty reference", { source: "human:" }, "source must start with verdict:, audit: or human:"],
    ["status", { status: "draft" as MemoryEntry["status"] }, "status must be one of candidate, admitted, superseded"],
    ["supersedes another project", { supersedes: ["shop-decision-20261001-a", "cart-decision-20261001-b"] },
      "supersedes 'cart-decision-20261001-b' is not an entry of project shop"],
    ["superseded without superseded_by", { status: "superseded" }, "superseded_by is set exactly when status is superseded"],
    ["superseded_by on an admitted entry", { supersededBy: "shop-decision-20261030-next" },
      "superseded_by is set exactly when status is superseded"],
    ["a tag in upper case", { tags: ["Testing"] }, "tags item 'Testing' is not a lower-case token"],
    ["a stack item with a space", { stack: ["dot net"] }, "stack item 'dot net' is not a lower-case token"],
    ["sections out of order", { body: "## Content\nx\n## Context\ny\n## Evidence\nz\n" },
      "the body needs ## Context, ## Content and ## Evidence, in this order"],
    ["a section missing", { body: "## Context\nx\n## Content\ny\n" },
      "the body needs ## Context, ## Content and ## Evidence, in this order"],
    ["body too long", { body: BODY + "y".repeat(2001 - BODY.length) }, "the body is 2001 characters, over 2000"],
    ["evidence in backticks naming an env file", { body: BODY.replace("`src/app/main.ts:10`", "`deploy/.env.production:3`") },
      "evidence names a secret-like file: deploy/.env.production"],
    ["evidence as path:line naming a key", { body: BODY.replace("`src/app/main.ts:10`", "see certs/server.pem:1 for it") },
      "evidence names a secret-like file: certs/server.pem"],
  ];
  for (const [label, over, text, type] of rows) {
    it(`${label}: one problem`, () => deepStrictEqual(entryProblems(base(type ?? "decision", over)), [text]));
  }

  it("type outside the four", () => {
    const entry = base("decision", { type: "rule" as EntryType, id: "shop-rule-20261022-sample-slug" });
    deepStrictEqual(entryProblems(entry), ["type must be one of decision, code-structure, method, mistake"]);
  });
  it("project not kebab (the id cannot be kebab either)", () => {
    const entry = base("decision", { project: "Shop", id: "Shop-decision-20261022-x" });
    deepStrictEqual(entryProblems(entry), [
      "id 'Shop-decision-20261022-x' is not Shop-decision-20261022-<slug>",
      "project 'Shop' is not a kebab-case name",
    ]);
  });
  it("date not a calendar date", () => {
    const entry = base("decision", { date: "2026-02-30", id: "shop-decision-20260230-x" });
    deepStrictEqual(entryProblems(entry), ["date '2026-02-30' is not YYYY-MM-DD"]);
  });
  it("lists the problems in the table order", () => {
    const problems = entryProblems(base("decision", { title: "", rationale: "", tags: ["A"] }));
    deepStrictEqual(problems, [
      "title must be one line of 1 to 90 characters", "rationale is empty", "tags item 'A' is not a lower-case token",
    ]);
  });

  it("names the key and the pattern of a secret, never the matched text", () => {
    const secret = ["AKIA", "ABCDEFGHIJKLMNOP"].join("");
    const problems = entryProblems(base("decision", { rationale: `the key ${secret} leaked`, body: `${BODY}\n${secret}\n` }));
    deepStrictEqual(problems, [
      "rationale looks like it holds a secret (AWS access key id)",
      "body looks like it holds a secret (AWS access key id)",
    ]);
    ok(problems.every((p) => !p.includes(secret)));
  });
  it("checks list values too", () => {
    const token = ["token=", "abcdefgh12"].join("");
    deepStrictEqual(entryProblems(base("decision", { tags: [token] })), [
      `tags item '${token}' is not a lower-case token`,
      "tags looks like it holds a secret (assigned secret)",
    ]);
  });
  it("names a provenance marker by its source, and ignores a g flag", () => {
    const markers = [/forbidden[ -]?product/gi, /never-here/];
    const entry = base("decision", { title: "From Forbidden Product notes" });
    deepStrictEqual(entryProblems(entry, markers), ["title carries a provenance marker (forbidden[ -]?product)"]);
    deepStrictEqual(entryProblems(entry, markers), ["title carries a provenance marker (forbidden[ -]?product)"]);
    deepStrictEqual(entryProblems(base("decision"), markers), []);
  });
  it("knows the sixteen keys", () => strictEqual(ENTRY_KEYS.length, 16));
});
