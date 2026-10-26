// The harness agent memories importAgentMemory reads: a sample MEMORY.md with its notes, and the candidate files it leaves.
import { HARNESS_AGENT_MEMORY_ROOT, importAgentMemory } from "./import-agent-memory.ts";
import { memoryLayout } from "../../domain/shared-memory/layout.ts";
import { FakeClock } from "../../../../tests/support/doubles/fake-clock.ts";
import { LiveListingFiles } from "../../../../tests/support/doubles/live-listing-files.ts";
import { entryText, sampleEntry } from "../../../../tests/support/fixtures/memory-entries.ts";

export const layout = memoryLayout(".orkeon/memory");
export const memory = { layout, project: "shop" };
export const root = HARNESS_AGENT_MEMORY_ROOT;
export const CONTRACT_NOTE = `${root}/dev-auditor/contract.md`;
export const CONTRACT_CANDIDATE = `${layout.candidates}/shop-method-20261024-contract-tests-first.md`;

/** dev-auditor's MEMORY.md: a linked entry, a plain one, a duplicate of the first, one an admitted entry holds. */
export const SAMPLE = [
  "- [Contract tests first](contract.md) — run them before the unit suite",
  "- Name the port before the adapter",
  "- Contract tests first",
  "- [Admitted already](gone.md) — an entry holds this topic",
].join("\n");

/** Two agent memories over the sample, an admitted entry, and `run` importing them on 2026-10-24. */
export function setup() {
  const files = new LiveListingFiles();
  files.files.set(`${root}/dev-auditor/MEMORY.md`, SAMPLE);
  files.files.set(CONTRACT_NOTE, "---\nname: c\n---\nA broken port fails fast.\n\n**Why:** two batches lost a day.\n");
  files.files.set(`${root}/adversarial-reviewer/MEMORY.md`, "- name the port before the adapter\n");
  const admitted = sampleEntry("decision", "admitted-already");
  files.files.set(`${layout.entries}/decision/${admitted.id}.md`, entryText(admitted));
  const deps = { files, clock: new FakeClock().now };
  return { files, run: () => importAgentMemory(deps, memory) };
}

/** The candidate files written, the list CANDIDATES.md left out, sorted. */
export const candidateFiles = (files: LiveListingFiles): string[] =>
  [...files.files.keys()].filter((p) => p.startsWith(`${layout.candidates}/`) && !p.endsWith("CANDIDATES.md")).sort();

/** The lengths of note text before a GitHub token: the token straddles the body's cut somewhere among them. */
export const CUT_POSITIONS: readonly number[] = Array.from({ length: 31 }, (_, i) => 1_500 + i * 20);

/** A note of `n` characters of words, then a GitHub token. */
export const noteWithTokenAt = (n: number): string =>
  `---\nname: c\n---\n${"word ".repeat(500).slice(0, n)} ghp_${"A1b2".repeat(10)} end\n`;

export const emptyWorld = () => ({ files: new LiveListingFiles(), clock: new FakeClock().now });
