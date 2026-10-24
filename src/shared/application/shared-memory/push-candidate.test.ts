// memory_push's use case (M-4): a candidate written, or refused with nothing written. Run:
//   node --test src/shared/application/shared-memory/push-candidate.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual, ok } from "node:assert";

import { pushCandidate, readPushInput } from "./push-candidate.ts";
import { parseEntry } from "../../domain/shared-memory/front-matter.ts";
import { memoryLayout } from "../../domain/shared-memory/layout.ts";
import { appendRefused } from "../../domain/shared-memory/refused.ts";
import { LiveListingFiles } from "../../../../tests/doubles/live-listing-files.ts";

const layout = memoryLayout(".orkeon/memory");
const memory = { layout, project: "shop" };
const clock = () => new Date("2026-10-24T10:00:00Z");
const input = {
  type: "method", title: "Run the contract tests first", topic: "contract tests first",
  applies_when: "a module has a contract test suite", rationale: "the slow suite hides the contract failure",
  evidence: ["src/app/main.ts:10"], tags: ["Testing"],
};

describe("pushCandidate", () => {
  it("writes a candidate with the default source, then the list", async () => {
    const files = new LiveListingFiles();
    const out = await pushCandidate({ files, clock }, memory, input);
    ok(out.ok);
    strictEqual(out.id, "shop-method-20261024-run-the-contract-tests-first");
    strictEqual(out.path, `${layout.candidates}/${out.id}.md`);
    const parsed = parseEntry(files.files.get(out.path)!);
    ok(parsed.ok);
    strictEqual(parsed.entry.status, "candidate");
    strictEqual(parsed.entry.topic, "contract-tests-first");
    strictEqual(parsed.entry.source, "human:2026-10-24 memory_push");
    deepStrictEqual(parsed.entry.tags, ["testing"]);
    ok(parsed.entry.body.includes("## Evidence\n- `src/app/main.ts:10`"));
    ok(files.files.get(layout.candidatesList)!.includes(out.id));
  });

  it("suffixes an id already taken", async () => {
    const files = new LiveListingFiles();
    const first = await pushCandidate({ files, clock }, memory, input);
    const second = await pushCandidate({ files, clock }, memory, input);
    ok(first.ok && second.ok);
    strictEqual(second.id, `${first.id}-2`);
    files.files.set(`${layout.entries}/method/${first.id}.md`, "admitted");
    const third = await pushCandidate({ files, clock }, memory, input);
    ok(!third.ok && third.refused.includes("an admitted entry already holds"));
  });

  it("refuses a secret-like file in an evidence item that holds a space", async () => {
    const files = new LiveListingFiles();
    const out = await pushCandidate({ files, clock }, memory, { ...input, evidence: [".env:3 holds the key"] });
    ok(!out.ok && out.refused.includes("secret-like file: .env"));
  });

  it("refuses a refused topic, an invalid entry, a missing field, and writes nothing", async () => {
    const files = new LiveListingFiles();
    files.files.set(layout.refused, appendRefused(null, { topic: "contract-tests-first", project: "shop", date: "2026-10-01", motif: "no" }));
    const refused = await pushCandidate({ files, clock }, memory, input);
    ok(!refused.ok && refused.refused.includes("was refused"));
    const mistake = await pushCandidate({ files, clock }, memory, { ...input, type: "mistake", topic: "other" });
    ok(!mistake.ok && mistake.refused.includes("a mistake needs correction"));
    const secret = await pushCandidate({ files, clock }, memory, { ...input, topic: "x", evidence: [".env:1"] });
    ok(!secret.ok && secret.refused.includes("secret-like"));
    const bare = await pushCandidate({ files, clock }, memory, { type: "method" });
    ok(!bare.ok && bare.refused.includes("title, topic, applies_when, rationale required"));
    strictEqual(files.writes.length, 0);
  });

  it("says a write failure, and an unreadable refused list stops it", async () => {
    const files = new LiveListingFiles();
    files.writeFailures.set(`${layout.candidates}/shop-method-20261024-run-the-contract-tests-first.md`, new Error("read-only mount"));
    const failed = await pushCandidate({ files, clock }, memory, input);
    ok(!failed.ok && failed.refused.includes("read-only mount"));
    const locked = new LiveListingFiles();
    locked.readErrors.set(layout.refused, new Error("permission denied"));
    const stopped = await pushCandidate({ files: locked, clock }, memory, input);
    ok(!stopped.ok && stopped.refused.includes("refused.md cannot be read"));
  });

  it("reads the tool's input: type, evidence and the optional mistake fields", () => {
    ok(!readPushInput({ ...input, type: "rule" }).ok);
    ok(!readPushInput({ ...input, evidence: [] }).ok);
    const read = readPushInput({ ...input, type: "mistake", correction: " do x ", detection_signal: "y" });
    ok(read.ok);
    strictEqual(read.input.correction, "do x");
    strictEqual(read.input.detectionSignal, "y");
  });
});
