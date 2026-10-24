// The shared memory's reference set, checked offline: the fixture the probe
// (src/crews/_probe-shared-memory/probe.ork.ts) runs live. rag_eval needs the runtime, so
// this checks the fixture only: every entry validates with the repository's own parser and
// checks, ids are unique and match their file, every expected source exists, q08's target
// supersedes a `superseded` entry that no case expects, and q13 expects nothing.
// Run: node --test tests/shared-memory-fixture.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parseEntry } from "../src/shared/domain/shared-memory/front-matter.ts";
import { entryProblems } from "../src/shared/domain/shared-memory/entry.ts";
import type { MemoryEntry } from "../src/shared/domain/shared-memory/entry.ts";
import { NEGATIVE_CASE, SUPERSESSION_CASE, parseGolden } from "../src/crews/_probe-shared-memory/domain/probe-verdict.ts";

const FIXTURE = fileURLToPath(new URL("./fixtures/shared-memory/", import.meta.url));
const markerFile = JSON.parse(readFileSync(fileURLToPath(new URL("../scripts/provenance-markers.json", import.meta.url)), "utf8"));
const MARKERS: RegExp[] = markerFile.markers.map((m: { source: string; flags: string }) => new RegExp(m.source, m.flags));

const files: string[] = readdirSync(join(FIXTURE, "entries"), { recursive: true, encoding: "utf8" })
  .filter((f) => f.endsWith(".md"))
  .map((f) => f.split("\\").join("/"))
  .sort();
const entries = new Map<string, { file: string; entry: MemoryEntry }>();
for (const file of files) {
  const parsed = parseEntry(readFileSync(join(FIXTURE, "entries", file), "utf8"));
  if (parsed.ok) entries.set(parsed.entry.id, { file, entry: parsed.entry });
}
const golden = parseGolden(readFileSync(join(FIXTURE, "eval", "golden.yaml"), "utf8"));
const byCase = new Map(golden.cases.map((c) => [c.id, c]));
const idOfSource = (source: string): string => basename(source, ".md");

describe("the shared-memory fixture's entries", () => {
  it("holds 12 entries: 4 decisions, 3 code-structures, 3 methods, 2 mistakes, from several projects", () => {
    strictEqual(files.length, 12);
    const count = (type: string) => files.filter((f) => f.startsWith(`${type}/`)).length;
    deepStrictEqual([count("decision"), count("code-structure"), count("method"), count("mistake")], [4, 3, 3, 2]);
    ok(new Set([...entries.values()].map((e) => e.entry.project)).size >= 3);
  });

  it("parses and validates every entry with the repository's own checks", () => {
    for (const file of files) {
      const parsed = parseEntry(readFileSync(join(FIXTURE, "entries", file), "utf8"));
      ok(parsed.ok, `${file}: ${parsed.ok ? "" : parsed.problems.join("; ")}`);
      deepStrictEqual(entryProblems(parsed.entry, MARKERS), [], file);
    }
  });

  it("names every file <type>/<id>.md, so the ids are unique", () => {
    strictEqual(entries.size, files.length);
    for (const [id, { file, entry }] of entries) strictEqual(file, `${entry.type}/${id}.md`);
  });

  it("links every supersession both ways, within one project", () => {
    for (const { entry } of entries.values()) {
      for (const old of entry.supersedes) {
        const target = entries.get(old)?.entry;
        ok(target, `${entry.id} supersedes the unknown ${old}`);
        strictEqual(target.status, "superseded");
        strictEqual(target.supersededBy, entry.id);
        strictEqual(target.project, entry.project);
      }
    }
  });
});

describe("the reference set (golden.yaml, the rag_eval dataset shape)", () => {
  it("has the cases q01 to q14 with unique ids, a question each, and its own collection", () => {
    deepStrictEqual(golden.cases.map((c) => c.id), Array.from({ length: 14 }, (_, i) => `q${String(i + 1).padStart(2, "0")}`));
    ok(golden.cases.every((c) => c.question.trim() !== ""));
    strictEqual(golden.collection, "memory-eval-golden");
    strictEqual(golden.corpus, "/workspace/.orkeon/memory/entries");
  });

  it("names, in every relevant, an entry file of the fixture that is admitted", () => {
    for (const c of golden.cases) {
      for (const source of c.relevant) {
        ok(source.startsWith("entries/"), `${c.id}: ${source}`);
        ok(existsSync(join(FIXTURE, source)), `${c.id}: ${source} does not exist`);
        strictEqual(entries.get(idOfSource(source))?.entry.status, "admitted", `${c.id}: ${source}`);
      }
    }
  });

  it("gives q08 a target that supersedes a superseded entry, and never expects a superseded id", () => {
    const target = entries.get(idOfSource(byCase.get(SUPERSESSION_CASE)?.relevant[0] ?? ""))?.entry;
    ok(target && target.supersedes.length > 0, "q08's target supersedes nothing");
    for (const old of target.supersedes) strictEqual(entries.get(old)?.entry.status, "superseded");
    const superseded = [...entries.values()].filter((e) => e.entry.status === "superseded").map((e) => e.entry.id);
    ok(superseded.length > 0);
    for (const c of golden.cases) for (const source of c.relevant) ok(!superseded.includes(idOfSource(source)), `${c.id}: ${source}`);
  });

  it("expects nothing for q13, the negative case, and something for every other case", () => {
    deepStrictEqual(byCase.get(NEGATIVE_CASE)?.relevant, []);
    for (const c of golden.cases) if (c.id !== NEGATIVE_CASE) ok(c.relevant.length > 0, c.id);
  });

  it("asks q02 across two projects that disagree on one topic", () => {
    const sources = byCase.get("q02")?.relevant.map((s) => entries.get(idOfSource(s))?.entry) ?? [];
    strictEqual(new Set(sources.map((e) => e?.project)).size, 2);
    strictEqual(new Set(sources.map((e) => e?.topic)).size, 1);
  });
});
