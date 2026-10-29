// The candidates /memory-admit is tested on, the harness it runs over (LiveListingFiles, FakeShell, a config reader and
// a console whose answers are scripted), and the argument lines with what each parses to.
import { runMemoryAdmit } from "../../../../src/commands/_lib/memory/memory-admit.ts";
import type { MemoryAdmitArgs, parseMemoryAdmitArgs } from "../../../../src/commands/_lib/memory/memory-admit.ts";
import { memoryLayout } from "../../../../src/shared/domain/shared-memory/layout.ts";
import { GIT_REMOTE_ORIGIN } from "../../../../src/shared/application/shared-memory/memory-settings.ts";
import { FakeClock } from "../../../support/doubles/fake-clock.ts";
import { FakeShell } from "../../../support/doubles/fake-shell.ts";
import { LiveListingFiles } from "../../../support/doubles/live-listing-files.ts";
import { entryText, sampleEntry } from "../../../support/fixtures/memory-entries.ts";

export const layout = memoryLayout(".orkeon/memory");

/** A method candidate. */
export const method = sampleEntry("method", "contract-first", { status: "candidate" });

/** A mistake candidate an audit of three batches proposed. */
export const audited = sampleEntry("mistake", "empty-cart", {
  status: "candidate", source: "audit:a/A-VERIFY-F1.md, b/B-VERIFY-F1.md, c/C-VERIFY-F2.md",
});

/** A mistake candidate of one batch only. */
export const oneBatch = sampleEntry("mistake", "one-batch", { status: "candidate" });

/**
 * /memory-admit over the two candidates `method` and `audited`, the settings `values`, and a console answering each
 * question with the next of `answers` (an error is thrown).
 */
export function admitHarness(values: Record<string, string> = {}, answers: unknown[] = []) {
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
  const run = (args: MemoryAdmitArgs) => runMemoryAdmit(args, { files, shell, config, clock: new FakeClock().now }, io);
  return { files, lines, asked, run };
}

/** The ids of the candidates a result hands the crew to admit. */
export const admittedIds = (r: unknown): string[] => ((r as { admit?: Array<{ id: string; sha1: string }> }).admit ?? []).map((c) => c.id);

export const ACCEPTED_ARGS_CASES: readonly { name: string; tokens: string[]; expected: ReturnType<typeof parseMemoryAdmitArgs> }[] = [
  { name: "reads no token as admitting every candidate", tokens: [], expected: { ok: true, args: { kind: "admit", ids: [] } } },
  { name: "reads ids, each once", tokens: ["a-b", "a-b"], expected: { ok: true, args: { kind: "admit", ids: ["a-b"] } } },
  { name: "reads --list", tokens: ["--list"], expected: { ok: true, args: { kind: "list" } } },
  {
    name: "reads --refuse with a motif",
    tokens: ["--refuse", "a-b", "too", "local"],
    expected: { ok: true, args: { kind: "refuse", id: "a-b", motif: "too local" } },
  },
  { name: "reads --import", tokens: ["--import"], expected: { ok: true, args: { kind: "import" } } },
];

export const REFUSED_ARGS_CASES: readonly { name: string; tokens: string[] }[] = [
  { name: "refuses --refuse without an id", tokens: ["--refuse"] },
  { name: "refuses an unknown option", tokens: ["--yes"] },
  { name: "refuses what is not an id", tokens: ["Not/An/Id"] },
  { name: "refuses --list with a token", tokens: ["--list", "x"] },
  { name: "refuses --import with a token", tokens: ["--import", "x"] },
];

/** The answers of a session that cannot prompt: the console throws, or answers nothing. */
export const NO_ANSWERS: readonly { name: string; answer: unknown }[] = [
  { name: "the console throws", answer: new Error("no console") },
  { name: "the console answers nothing", answer: undefined },
];

/** The answers to a question cancelled after a first yes: the console throws, or answers nothing. */
export const CANCELLED_ANSWERS: readonly { name: string; answer: unknown }[] = [
  { name: "the console throws", answer: new Error("cancelled") },
  { name: "the console answers nothing", answer: undefined },
];

/** The line asked and the crews running when it is (crew name to tickets), with the refusal expected: none when no
 *  admission is being written, none for a line that launches no crew. */
export const BUSY_CASES: readonly { name: string; args: MemoryAdmitArgs; tickets: Record<string, string[]>; expected: string | undefined }[] = [
  { name: "lets an admission start when no crew runs", args: { kind: "admit", ids: ["a"] }, tickets: {}, expected: undefined },
  { name: "lets an admission start while a review runs", args: { kind: "admit", ids: ["a"] }, tickets: { "code-review": ["t2"] }, expected: undefined },
  {
    name: "refuses an admission while the previous one is being written, naming its ticket",
    args: { kind: "admit", ids: ["a"] },
    tickets: { "shared-memory-admit": ["t5"] },
    expected: "memory admit: the previous admission is still being written (ticket t5): type it again in a moment",
  },
  { name: "lets --list pass while an admission is being written", args: { kind: "list" }, tickets: { "shared-memory-admit": ["t5"] }, expected: undefined },
  { name: "lets --refuse pass while an admission is being written", args: { kind: "refuse", id: "a" }, tickets: { "shared-memory-admit": ["t5"] }, expected: undefined },
  { name: "lets --import pass while an admission is being written", args: { kind: "import" }, tickets: { "shared-memory-admit": ["t5"] }, expected: undefined },
];
