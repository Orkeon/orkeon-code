// The checkout, the worktree and the seed target of the seed and harvest tests, over FakeFiles.
import { worktreePlace } from "../../../../src/shared/domain/git/worktree.ts";
import { FakeFiles } from "../../../support/doubles/fake-files.ts";
import { seedWorktree } from "../../../../src/crews/dev-batches/application/seed-harvest.ts";
import type { SeedSnapshot, SeedTarget } from "../../../../src/crews/dev-batches/application/seed-harvest.ts";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";

export const PLACE = worktreePlace("prune-F2")!;
export const TARGET: SeedTarget = { place: PLACE, work: "todo", code: "prune", memoryDir: ".orkeon/memory", batch: "F2" };
export const WT = `${WORKSPACE}/.orkeon/worktrees/prune-F2`;

/** Files under `base`, each folder listed by its parent as the runtime's directory_read does. */
export function put(files: FakeFiles, base: string, tree: Record<string, string>): void {
  for (const [path, content] of Object.entries(tree)) {
    files.files.set(`${base}/${path}`, content);
    const parts = path.split("/");
    for (let i = 1; i <= parts.length; i++) {
      const dir = [base, ...parts.slice(0, i - 1)].join("/");
      const name = parts[i - 1];
      const listed = files.listings.get(dir) ?? [];
      if (!listed.includes(name)) files.listings.set(dir, [...listed, name]);
    }
  }
}

/** The main checkout's files the seed copies. */
export const MAIN: Record<string, string> = {
  "todo/prune/PRUNE-PLAN.md": "plan",
  "todo/prune/PRUNE-PLAN-F2.md": "sheet edited in main",
  "todo/prune/PRUNE-PLAN-F3.md": "sheet F3",
  ".orkeon/dev/prune/plan.json": "{}",
  ".orkeon/config.json": "{\"dev\":{}}",
  ".orkeon/memory/decisions/a.md": "memory",
};

/** FakeFiles holding the main checkout, and the worktree's `tree` when given. */
export function checkout(tree?: Record<string, string>): FakeFiles {
  const files = new FakeFiles();
  put(files, WORKSPACE, MAIN);
  if (tree !== undefined) put(files, WT, tree);
  return files;
}

/** The checkout with a fresh worktree seeded from it; throws when the seed fails. */
export async function seededCheckout(): Promise<{ files: FakeFiles; snapshot: SeedSnapshot }> {
  const files = checkout();
  const seeded = await seedWorktree(files, TARGET, true);
  if (!seeded.ok) throw new Error(`the seed failed: ${seeded.line}`);
  return { files, snapshot: seeded.snapshot };
}

/** Files (relative to the checkout) the batch F2 owns. */
export const OWNED_PATHS: readonly string[] = [
  "todo/prune/PRUNE-PLAN-F2.md", "todo/prune/PRUNE-VERIFY-F2.md", "todo/prune/capture-F2/table.md",
  "todo/prune/logs/F2-run_tests-1.log", ".orkeon/dev/prune/implement-F2.json",
];

/** Files the batch F2 does not own: the plan, another batch's, a log of no batch, a capture of F21, the plan state. */
export const NOT_OWNED_PATHS: readonly string[] = [
  "todo/prune/PRUNE-PLAN.md", "todo/prune/PRUNE-PLAN-F3.md", "todo/prune/logs/F3-run_tests-1.log",
  "todo/prune/logs/run_tests-1.log", "todo/prune/capture-F21/x.md", ".orkeon/dev/prune/plan.json",
];

/** Targets a seed refuses: a work folder or a code outside the checkout. */
export const UNSAFE_TARGETS: readonly { name: string; target: SeedTarget }[] = [
  { name: "refuses an absolute work folder, nothing written", target: { ...TARGET, work: "/abs/elsewhere" } },
  { name: "refuses a work folder above the checkout, nothing written", target: { ...TARGET, work: "../up" } },
  { name: "refuses a code with a quote, nothing written", target: { ...TARGET, code: "a'b" } },
];

/** What a batch wrote in its worktree: its own files, and a rewritten plan it does not own. */
export const BATCH_WRITES: Record<string, string> = {
  "todo/prune/PRUNE-PLAN-F2.md": "ticked", "todo/prune/PRUNE-VERIFY-F2.md": "VALID",
  "todo/prune/capture-F2/table.md": "rows", "todo/prune/logs/F2-run_tests-1.log": "exit 0",
  "todo/prune/PRUNE-PLAN.md": "plan rewritten by the batch",
};
