// /memory-admit (M-4): parsing, the list, a refusal, one confirmation per candidate, the headless
// refusal and auto-admission of an audited candidate. Run: node --test tests/commands-memory-admit.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual, ok } from "node:assert";

import { parseMemoryAdmitArgs, runMemoryAdmit } from "../src/commands/_lib/memory-admit.ts";
import type { MemoryAdmitArgs } from "../src/commands/_lib/memory-admit.ts";
import { memoryLayout } from "../src/shared/domain/shared-memory/layout.ts";
import type { MemoryEntry } from "../src/shared/domain/shared-memory/entry.ts";
import { GIT_REMOTE_ORIGIN } from "../src/shared/application/shared-memory/memory-settings.ts";
import { FakeShell } from "./support/fake-shell.ts";
import { LiveListingFiles } from "./doubles/live-listing-files.ts";
import { entryText, sampleEntry } from "./doubles/memory-entries.ts";

const layout = memoryLayout(".orkeon/memory");
const method = sampleEntry("method", "contract-first", { status: "candidate" });
const audited = sampleEntry("mistake", "empty-cart", {
  status: "candidate", source: "audit:a/A-VERIFY-F1.md, b/B-VERIFY-F1.md, c/C-VERIFY-F2.md",
});
const oneBatch = sampleEntry("mistake", "one-batch", { status: "candidate" });

function setup(values: Record<string, string> = {}, answers: unknown[] = []) {
  const files = new LiveListingFiles();
  for (const c of [method, audited]) files.files.set(`${layout.candidates}/${c.id}.md`, entryText(c));
  const shell = new FakeShell();
  shell.results[GIT_REMOTE_ORIGIN] = { stdout: "https://example.com/acme/shop.git" };
  const config = { readValue: async (key: string) => ({ key, value: values[key], source: "file" as const }) };
  const lines: string[] = [];
  const asked: string[] = [];
  const io = {
    writeLine: (t: string) => { lines.push(t); },
    confirm: async (q: string) => {
      asked.push(q);
      const a = answers.shift();
      if (a instanceof Error) throw a;
      return a;
    },
  };
  const run = (args: MemoryAdmitArgs) => runMemoryAdmit(args, { files, shell, config, clock: () => new Date("2026-10-24T10:00:00Z") }, io);
  return { files, lines, asked, run };
}

const ids = (r: unknown): string[] => ((r as { admit?: Array<{ id: string; sha1: string }> }).admit ?? []).map((c) => c.id);

describe("parseMemoryAdmitArgs", () => {
  it("reads ids, --list and --refuse with a motif", () => {
    deepStrictEqual(parseMemoryAdmitArgs([]), { ok: true, args: { kind: "admit", ids: [] } });
    deepStrictEqual(parseMemoryAdmitArgs(["a-b", "a-b"]), { ok: true, args: { kind: "admit", ids: ["a-b"] } });
    deepStrictEqual(parseMemoryAdmitArgs(["--list"]), { ok: true, args: { kind: "list" } });
    deepStrictEqual(parseMemoryAdmitArgs(["--refuse", "a-b", "too", "local"]), { ok: true, args: { kind: "refuse", id: "a-b", motif: "too local" } });
    ok(!parseMemoryAdmitArgs(["--refuse"]).ok);
    ok(!parseMemoryAdmitArgs(["--yes"]).ok);
    ok(!parseMemoryAdmitArgs(["Not/An/Id"]).ok);
    ok(!parseMemoryAdmitArgs(["--list", "x"]).ok);
    deepStrictEqual(parseMemoryAdmitArgs(["--import"]), { ok: true, args: { kind: "import" } });
    ok(!parseMemoryAdmitArgs(["--import", "x"]).ok);
  });
});

describe("runMemoryAdmit", () => {
  it("imports the harness's agent memory into candidates and asks nothing", async () => {
    const { files, lines, asked, run } = setup();
    files.files.set("/workspace/.claude/agent-memory/dev-auditor/MEMORY.md", "- Name the port before the adapter\n");
    const result = await run({ kind: "import" });
    const message = (result as { message?: string }).message ?? "";
    ok(message.includes("1 candidate(s) written: shop-method-20261024-name-the-port-before-the-adapter"), message);
    ok(files.files.has(`${layout.candidates}/shop-method-20261024-name-the-port-before-the-adapter.md`));
    deepStrictEqual(asked, []);
    deepStrictEqual(lines, []);
  });

  it("lists the pending candidates", async () => {
    const { run } = setup();
    const r = await run({ kind: "list" });
    ok("message" in r && r.message.includes(method.id) && r.message.includes(audited.id));
  });

  it("asks once per candidate and hands the yes to the crew", async () => {
    const { run, asked, lines } = setup({}, [true, false]);
    const r = await run({ kind: "admit", ids: [] });
    deepStrictEqual(ids(r), [method.id]);
    strictEqual(asked.length, 2);
    ok(lines.some((l) => l.includes("applies when: a module does the thing")));
    ok(lines.includes("  left as a candidate"));
  });

  it("admits nothing in a session that cannot prompt", async () => {
    for (const answer of [new Error("no console"), undefined]) {
      const { run } = setup({}, [answer]);
      const r = await run({ kind: "admit", ids: [] });
      ok("refused" in r && r.refused.includes("cannot prompt"));
    }
  });

  it("keeps a confirmed admission when a later question is cancelled", async () => {
    for (const answer of [new Error("cancelled"), undefined]) {
      const { run, asked } = setup({}, [true, answer]);
      const r = await run({ kind: "admit", ids: [] });
      strictEqual(asked.length, 2);
      strictEqual(ids(r).length, 1);
      ok((r as any).refusedQuestions.includes("got no answer"), JSON.stringify(r));
      strictEqual((r as any).refusedQuestions.includes("cannot prompt"), false);
    }
  });

  it("admits an audited candidate unasked when memory.autoAdmitAudited is true", async () => {
    const { run, asked } = setup({ "memory.autoAdmitAudited": "true" }, []);
    const r = await run({ kind: "admit", ids: [audited.id] });
    deepStrictEqual(ids(r), [audited.id]);
    strictEqual(asked.length, 0);
    ok(/^[0-9a-f]{40}$/.test((r as any).admit[0].sha1));
  });

  it("asks about an audited mistake of fewer than three batches, and keeps the unasked ones headless", async () => {
    const { run, files, asked } = setup({ "memory.autoAdmitAudited": "true" }, [new Error("no console")]);
    files.files.set(`${layout.candidates}/${oneBatch.id}.md`, entryText(oneBatch));
    const r = await run({ kind: "admit", ids: [] });
    deepStrictEqual(ids(r), [audited.id]);
    ok((r as any).refusedQuestions.includes("cannot prompt"));
    strictEqual(asked.length, 1);
  });

  it("names an id that is not pending, and says when nothing is", async () => {
    const { run, lines } = setup();
    const r = await run({ kind: "admit", ids: ["shop-method-20261022-absent"] });
    deepStrictEqual(r, { message: "Nothing admitted." });
    ok(lines[0].includes("not a pending candidate"));
    const empty = setup();
    empty.files.files.clear();
    const none = await empty.run({ kind: "admit", ids: [] });
    ok("message" in none && none.message.startsWith("No pending candidate"));
  });

  it("refuses a candidate here, without the crew", async () => {
    const { run, files } = setup();
    const r = await run({ kind: "refuse", id: method.id, motif: "too local" });
    ok("message" in r && r.message === `refused ${method.id}`);
    ok(files.files.get(layout.refused)!.includes("contract-first | shop | 2026-10-24 | too local"));
    const again = await run({ kind: "refuse", id: method.id });
    ok("refused" in again);
  });
});
