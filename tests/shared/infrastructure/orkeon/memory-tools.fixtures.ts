// The world the memory tools run in (M-5): files listed live, a shell answering the project's origin, a shared memory
// fake and a fixed clock; the specs and the candidate the tests push.
import type { MemoryToolPorts } from "../../../../src/shared/infrastructure/orkeon/memory-tools.ts";
import { MEMORY_PUSH, MEMORY_RECALL, memoryPushTool, memoryRecallTool } from "../../../../src/shared/infrastructure/orkeon/memory-tools.ts";
import type { ToolBuilderFactory } from "../../../../src/shared/infrastructure/orkeon/script-tools.ts";
import { memoryLayout } from "../../../../src/shared/domain/shared-memory/layout.ts";
import { GIT_REMOTE_ORIGIN } from "../../../../src/shared/application/shared-memory/memory-settings.ts";
import { FakeClock } from "../../../support/doubles/fake-clock.ts";
import { FakeShell } from "../../../support/doubles/fake-shell.ts";
import { FakeSharedMemory } from "../../../support/doubles/fake-shared-memory.ts";
import { LiveListingFiles } from "../../../support/doubles/live-listing-files.ts";
import { entryText, sampleEntry } from "../../../support/fixtures/memory-entries.ts";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";

export const ROOT = `${WORKSPACE}/.orkeon/worktrees/prune-F2`;

export const layout = memoryLayout(".orkeon/memory");

/** The ports of a project whose origin is acme/shop, on 2026-10-24, its memory settings unset. */
export function world() {
  const files = new LiveListingFiles();
  const shell = new FakeShell();
  shell.results[GIT_REMOTE_ORIGIN] = { stdout: "git@example.com:acme/shop.git" };
  const memory = new FakeSharedMemory();
  const ports: MemoryToolPorts = {
    files, shell, memory, clock: new FakeClock().now,
    config: { readValue: async (key: string) => ({ key, value: undefined, source: "unset" as const }) },
  };
  return { files, memory, ports: () => ports };
}

/** A world holding one admitted mistake entry, which the index finds with a score of 0.8. */
export function worldWithEntry() {
  const w = world();
  const kept = sampleEntry("mistake", "loop");
  const path = `${layout.entries}/mistake/${kept.id}.md`;
  w.files.files.set(path, entryText(kept));
  w.memory.hits = [{ sourceId: path, score: 0.8 }];
  return { ...w, kept, path };
}

/** Runs a tool as the model would. */
export const run = (tool: Tool<unknown, unknown>, input: unknown) => (tool as any).execute(input) as Promise<any>;

export interface ToolSpecCase {
  spec: { name: string };
  make: (builder: ToolBuilderFactory, ports: () => MemoryToolPorts) => Tool<unknown, unknown>;
}

export const MEMORY_TOOL_SPECS: readonly ToolSpecCase[] = [
  { spec: MEMORY_RECALL, make: memoryRecallTool },
  { spec: MEMORY_PUSH, make: (b, p) => memoryPushTool(b, p, "default") },
];

/** A decision the model pushes, with its evidence. */
export const DECISION = {
  type: "decision", title: "Keep the ports narrow", topic: "narrow ports", applies_when: "a use case needs a port",
  rationale: "wide ports leaked", evidence: ["src/shared/application/ports.ts:45"],
};

export const DECISION_CANDIDATE = {
  candidate_path: `${layout.candidates}/shop-decision-20261024-keep-the-ports-narrow.md`,
  id: "shop-decision-20261024-keep-the-ports-narrow",
  status: "candidate",
};
