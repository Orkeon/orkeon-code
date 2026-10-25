// The pack fixtures, the constructs and the refusals the YAML subset reader is tested on.
// The two pack fixtures are copies of the workshop's repo-orkeon and repo-orkeon-workshop
// packs (orkeon-workshop 6873ee2, packs/<name>/references/repo.yaml). Their expected
// values were produced once with PyYAML 6.0, from the repository root:
//   python3 -I -c 'import json,sys,yaml; print(json.dumps(yaml.safe_load(open(sys.argv[1], encoding="utf-8")), ensure_ascii=False, indent=1))' tests/fixtures/dev/<name>.yaml > tests/fixtures/dev/<name>.pyyaml.json
import { readFileSync } from "node:fs";
import { parseYamlSubset } from "./yaml-subset.ts";
import type { YamlValue } from "./yaml-subset.ts";

/** A file of tests/fixtures/dev/. */
export const fixture = (name: string): string =>
  readFileSync(new URL(`../../../../tests/fixtures/dev/${name}`, import.meta.url), "utf8");

/** The two pack fixtures. */
export const PACKS: readonly string[] = ["repo-orkeon", "repo-orkeon-workshop"];

/** The value `text` reads as; throws on a refusal. */
export function value(text: string): YamlValue {
  const r = parseYamlSubset(text);
  if (!r.ok) throw new Error(`unexpected refusal: line ${r.error.line}: ${r.error.message}`);
  return r.value;
}

/** The refusal of `text`; throws when it is accepted. */
export function refusal(text: string): { line: number; message: string } {
  const r = parseYamlSubset(text);
  if (r.ok) throw new Error(`accepted: ${JSON.stringify(r.value)}`);
  return r.error;
}

export interface ConstructCase {
  name: string;
  text: string;
  expected: YamlValue;
}

/** Each construct of the subset, and the value PyYAML gives it. */
export const CONSTRUCTS: readonly ConstructCase[] = [
  {
    name: "reads a nested map three levels deep",
    text: "top:\n  mid:\n    low: x\n  other: y\nnext: z\n",
    expected: { top: { mid: { low: "x" }, other: "y" }, next: "z" },
  },
  {
    name: "reads a list of scalars, deeper than its key or at its indent",
    text: "a:\n  - one\n  - two\nb:\n- three\nc: d\n",
    expected: { a: ["one", "two"], b: ["three"], c: "d" },
  },
  {
    name: "reads a list of maps whose keys align after the dash",
    text: "items:\n  - name: first\n    note: \"it holds '-'\"\n  - name: second\n",
    expected: { items: [{ name: "first", note: "it holds '-'" }, { name: "second" }] },
  },
  {
    name: "reads one-line flow sequences, the empty one included",
    text: "a: [x, 'y z', \"w\"]\nb: []\nc: [1, true]   # note\n",
    expected: { a: ["x", "y z", "w"], b: [], c: [1, true] },
  },
  { name: "reads '' inside a single-quoted scalar as one quote", text: "a: 'it''s a|b'\n", expected: { a: "it's a|b" } },
  {
    name: "keeps # and ' inside a double-quoted scalar, and reads its escapes",
    text: "a: \"x # y 'z'\"   # a comment\nb: \"q\\\"\\\\\\/\\n\\t\"\n",
    expected: { a: "x # y 'z'", b: "q\"\\/\n\t" },
  },
  {
    name: "starts a comment at ' #' but not at 'a#b'",
    text: "a: one # two\nb: c#d\nc: https://example.org/x?y=1&z   # where\n",
    expected: { a: "one", b: "c#d", c: "https://example.org/x?y=1&z" },
  },
  {
    name: "keeps quotes, angle brackets, pipes and inner colons of a plain value",
    text: "a: run <x> --filter \"Name~<C>\" | tee a:b\n",
    expected: { a: "run <x> --filter \"Name~<C>\" | tee a:b" },
  },
  {
    name: "folds a '>-' block: one space per line, a blank line as a newline, ended by a comment line",
    text: "a: >-\n  one\n  two # kept\n\n  three\n\n# outside\nb: c\nlist:\n  - >-\n    x\n    y\n",
    expected: { a: "one two # kept\nthree", b: "c", list: ["x y"] },
  },
  {
    name: "types integers, booleans, nulls and floats as PyYAML does, and keeps 'none' a string",
    text: "a: 30\nb: -1_000\nc: yes\nd: Off\ne: ~\nf: Null\ng: none\nh: 1.5\ni: 09\nj: 1.5e3\n",
    expected: { a: 30, b: -1000, c: true, d: false, e: null, f: null, g: "none", h: 1.5, i: "09", j: "1.5e3" },
  },
  {
    name: "gives null to an empty value, and to a bare dash",
    text: "a:\nb: x\nc:\n  -\n  - y\n",
    expected: { a: null, b: "x", c: [null, "y"] },
  },
  { name: "gives null to a document of comments and blank lines", text: "# only a comment\n\n   # another\n", expected: null },
  { name: "gives null to an empty document", text: "", expected: null },
  { name: "ignores blank lines between top-level sections", text: "a: 1\n\n\nb:\n\n  c: 2\n", expected: { a: 1, b: { c: 2 } } },
  { name: "keeps a tab inside quotes or a comment", text: "a: 'x\ty'   # c\td\nb: ?x\n", expected: { a: "x\ty", b: "?x" } },
  {
    name: "ends a '>-' block at a comment shallower than its text but deeper than its key",
    text: "a:\n  b: >-\n      t\n    # note\n  d: 1\n",
    expected: { a: { b: "t", d: 1 } },
  },
  { name: "skips a leading byte order mark", text: "\uFEFFa: 1\n", expected: { a: 1 } },
];

/** Each refusal: what the text holds, the text, the line and the message. */
export const REFUSALS: ReadonlyArray<[title: string, text: string, line: number, message: string]> = [
    ["a tab in the indentation", "a:\n\tb: c\n", 2, "a tab in the indentation"],
    ["a document marker", "---\na: b\n", 1, "a document marker is not supported"],
    ["an end marker", "a: b\n...\n", 2, "a document marker is not supported"],
    ["an anchor", "a: &x b\n", 1, "anchors, aliases and tags are not supported"],
    ["an alias", "a: b\nc: *x\n", 2, "anchors, aliases and tags are not supported"],
    ["a tag", "a: !str b\n", 1, "anchors, aliases and tags are not supported"],
    ["a flow mapping", "a: {b: c}\n", 1, "a flow mapping is not supported"],
    ["an open flow sequence", "a: [b, c\n", 1, "a flow sequence must close on its line"],
    ["a nested flow sequence", "a: [b, [c]]\n", 1, "a nested flow sequence is not supported"],
    ["a literal block", "a: |\n  b\n", 1, "only the folded block '>-' is supported, not '|'"],
    ["a stripped literal block", "a: |-\n  b\n", 1, "only the folded block '>-' is supported, not '|-'"],
    ["a clipped folded block", "a: >\n  b\n", 1, "only the folded block '>-' is supported, not '>'"],
    ["a kept folded block", "a: >+\n  b\n", 1, "only the folded block '>-' is supported, not '>+'"],
    ["a kept literal block", "a: |+\n  b\n", 1, "only the folded block '>-' is supported, not '|+'"],
    ["a more-indented folded line", "a: >-\n  b\n    c\n", 3, "a more-indented line inside a folded block is not supported"],
    ["an open double quote", "a: \"b\n", 1, "a quoted scalar must close on its line"],
    ["an open single quote", "a: 'b\n", 1, "a quoted scalar must close on its line"],
    ["text after a closing quote", "a: \"b\" c\n", 1, "text after a closing quote"],
    ["an unknown escape", "a: \"b\\x\"\n", 1, "an unknown escape '\\x' in a double-quoted scalar"],
    ["': ' inside a plain value", "a: b: c\n", 1, "': ' inside a plain value: quote it"],
    ["an octal-looking number", "a: 010\n", 1, "an ambiguous number '010': quote it"],
    ["a hexadecimal number", "a: 0x1F\n", 1, "an ambiguous number '0x1F': quote it"],
    ["a sexagesimal number", "a: 1:30\n", 1, "an ambiguous number '1:30': quote it"],
    ["a 1.2 octal number", "a: 0o7\n", 1, "an ambiguous number '0o7': quote it"],
    ["a duplicate key", "a: 1\nb: 2\na: 3\n", 3, "a duplicate key 'a'"],
    ["a quoted key", "\"a\": b\n", 1, "a mapping key must be a plain name"],
    ["an explicit key", "a: 1\n? b\n", 2, "a mapping key must be a plain name"],
    ["a key PyYAML reads as a boolean", "yes: 1\n", 1, "a mapping key must be a plain name"],
    ["a line deeper than its parent allows", "a: 1\n  b: 2\n", 2, "bad indentation (a value continued on the next line is not supported)"],
    ["a continuation line", "a:\n  - one\n    two\n", 3, "bad indentation (a value continued on the next line is not supported)"],
    ["a plain line among keys", "a: 1\nb\n", 2, "bad indentation (a value continued on the next line is not supported)"],
    ["an item where a key was expected", "a: 1\n- b\n", 2, "a sequence item where a mapping key was expected"],
    ["a key where an item was expected", "- a\nb: c\n", 2, "a mapping key where a sequence item was expected"],
    ["a nested item on one line", "a:\n  - - x\n", 2, "a nested sequence item on one line is not supported"],
    ["a tab after a key's colon", "a:\tb\n", 1, "a tab outside quotes and comments"],
    ["a tab inside a plain value", "a: 1\nb: c\td\n", 2, "a tab outside quotes and comments"],
    ["a plain value opening with '%'", "a: %x\n", 1, "a plain value cannot start with '%': quote it"],
    ["a plain value opening with '@'", "a: [b, @c]\n", 1, "a plain value cannot start with '@': quote it"],
    ["a plain value opening with '? '", "a: ? b\n", 1, "a plain value cannot start with '?': quote it"],
];
