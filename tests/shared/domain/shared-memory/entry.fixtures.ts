// The entries entryProblems is tested on: a valid base, and one broken field per case.
import type { EntryType, MemoryEntry } from "../../../../src/shared/domain/shared-memory/entry.ts";

export const BODY = "## Context\nA sentence of context.\n\n## Content\nThe rule itself.\n\n## Evidence\n`src/app/main.ts:10`\n";

/** A valid admitted entry of `type`, its fields overridable. */
export function base(type: EntryType, over: Partial<MemoryEntry> = {}): MemoryEntry {
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

export interface OneProblemCase {
  name: string;
  over: Partial<MemoryEntry>;
  problem: string;
  /** The type of the entry, a decision when absent. */
  type?: EntryType;
}

/** Entries broken in one field, and the one problem each gives. */
export const ONE_PROBLEM: readonly OneProblemCase[] = [
  { name: "id without its prefix", over: { id: "shop-decision-20261021-sample" },
    problem: "id 'shop-decision-20261021-sample' is not shop-decision-20261022-<slug>" },
  { name: "id not kebab", over: { id: "shop-decision-20261022-Bad_Slug" },
    problem: "id 'shop-decision-20261022-Bad_Slug' is not shop-decision-20261022-<slug>" },
  { name: "id with no slug", over: { id: "shop-decision-20261022-" }, problem: "id 'shop-decision-20261022-' is not shop-decision-20261022-<slug>" },
  { name: "title empty", over: { title: "" }, problem: "title must be one line of 1 to 90 characters" },
  { name: "title on two lines", over: { title: "a\nb" }, problem: "title must be one line of 1 to 90 characters" },
  { name: "title too long", over: { title: "x".repeat(91) }, problem: "title must be one line of 1 to 90 characters" },
  { name: "topic too long", over: { topic: "a".repeat(61) }, problem: `topic '${"a".repeat(61)}' is not a kebab slug of at most 60 characters` },
  { name: "topic not kebab", over: { topic: "Some Topic" }, problem: "topic 'Some Topic' is not a kebab slug of at most 60 characters" },
  { name: "applies_when empty", over: { appliesWhen: " " }, problem: "applies_when is empty" },
  { name: "rationale empty", over: { rationale: "" }, problem: "rationale is empty" },
  { name: "mistake without correction", over: { correction: undefined }, problem: "a mistake needs correction", type: "mistake" },
  { name: "mistake without detection_signal", over: { detectionSignal: "" }, problem: "a mistake needs detection_signal", type: "mistake" },
  { name: "correction on a decision", over: { correction: "x" }, problem: "correction is for a mistake only" },
  { name: "detection_signal on a method", over: { detectionSignal: "x" }, problem: "detection_signal is for a mistake only", type: "method" },
  { name: "source without a kind", over: { source: "workbench/x.md" }, problem: "source must start with verdict:, audit: or human:" },
  { name: "source with an empty reference", over: { source: "human:" }, problem: "source must start with verdict:, audit: or human:" },
  { name: "status", over: { status: "draft" as MemoryEntry["status"] }, problem: "status must be one of candidate, admitted, superseded" },
  { name: "supersedes another project", over: { supersedes: ["shop-decision-20261001-a", "cart-decision-20261001-b"] },
    problem: "supersedes 'cart-decision-20261001-b' is not an entry of project shop" },
  { name: "superseded without superseded_by", over: { status: "superseded" }, problem: "superseded_by is set exactly when status is superseded" },
  { name: "superseded_by on an admitted entry", over: { supersededBy: "shop-decision-20261030-next" },
    problem: "superseded_by is set exactly when status is superseded" },
  { name: "a tag in upper case", over: { tags: ["Testing"] }, problem: "tags item 'Testing' is not a lower-case token" },
  { name: "a stack item with a space", over: { stack: ["dot net"] }, problem: "stack item 'dot net' is not a lower-case token" },
  { name: "sections out of order", over: { body: "## Content\nx\n## Context\ny\n## Evidence\nz\n" },
    problem: "the body needs ## Context, ## Content and ## Evidence, in this order" },
  { name: "a section missing", over: { body: "## Context\nx\n## Content\ny\n" },
    problem: "the body needs ## Context, ## Content and ## Evidence, in this order" },
  { name: "body too long", over: { body: BODY + "y".repeat(2001 - BODY.length) }, problem: "the body is 2001 characters, over 2000" },
  { name: "evidence in backticks naming an env file", over: { body: BODY.replace("`src/app/main.ts:10`", "`deploy/.env.production:3`") },
    problem: "evidence names a secret-like file: deploy/.env.production" },
  { name: "evidence as path:line naming a key", over: { body: BODY.replace("`src/app/main.ts:10`", "see certs/server.pem:1 for it") },
    problem: "evidence names a secret-like file: certs/server.pem" },
];

/** An AWS access key id, built so that no scanner reads it in this file. */
export const AWS_KEY = ["AKIA", "ABCDEFGHIJKLMNOP"].join("");

/** An assigned secret, built the same way. */
export const ASSIGNED_TOKEN = ["token=", "abcdefgh12"].join("");

/** Provenance markers: one with a g flag that matches "Forbidden Product", one that matches nothing. */
export const provenanceMarkers = (): RegExp[] => [/forbidden[ -]?product/gi, /never-here/];
