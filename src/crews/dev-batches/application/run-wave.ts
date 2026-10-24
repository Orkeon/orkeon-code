// One wave of a parallel /dev-batches (`--concurrency n`, n from 2; temp/26 L8P-D1): the batches of the wave, at
// most n, each on its own worktree `.orkeon/worktrees/<code>-F<n>` and branch `batches/<code>/F<n>`, made from the
// work branch or reused when a killed run left it. The first wave's probe proves git works under a worktree as a
// working root (Orkeon/orkeon#188); every worktree is seeded (seed-harvest.ts); the launches are logged and written;
// then `runBatch`, the crew's (a batch agent under the worktree, its implement, audit and close), runs them all at
// once. Once all have settled the driver, only writer of the main checkout, takes them in id order: a VALID batch is
// merged by fast-forward (rebased in its worktree when needed), its files harvested, its worktree removed; a GAPS or
// BLOCKED one is logged, harvested and keeps its worktree, and the run stops there (a human decides) - a neighbour
// still running is never stopped (L8P-D9).
import type { Files, Shell } from "../../../shared/application/ports.ts";
import { gitReason, runGit } from "../../../shared/application/git/commit-files.ts";
import { createBatchWorktree, mergeValidBatch, removeBatchWorktree } from "../../../shared/application/git/batch-worktree.ts";
import { concurrencyGitRefusal } from "../../../shared/domain/dev/batches-concurrency.ts";
import type { BatchesLogEntry } from "../../../shared/domain/dev/batches-state.ts";
import { parseBatchSheet } from "../../../shared/domain/dev/plan-format.ts";
import { batchBranch, batchWorktreeName, gitBranchExists, gitCommitsNotIn, gitWorktreeHead, worktreePlace } from "../../../shared/domain/git/worktree.ts";
import type { WorktreePlace } from "../../../shared/domain/git/worktree.ts";
import { shellQuote } from "../../../shared/domain/git/close.ts";
import { eventLine, lastEntryOf } from "../domain/batches-log.ts";
import { harvestBatch, seedWorktree } from "./seed-harvest.ts";
import type { SeedTarget } from "./seed-harvest.ts";

/** What the crew's batch agent is run with. */
export interface BatchRun {
  batch: string;
  /** The worktree's name, `<code>-F<n>`. */
  name: string;
  /** The agent's working root, `/workspace/.orkeon/worktrees/<name>`. */
  root: string;
  branch: string;
  /** The open steps of its sheet; absent, every step. */
  steps?: number;
}

/** What a batch agent answers. */
export interface BatchOutcome {
  batch: string;
  verdict: "VALID" | "GAPS" | "BLOCKED" | null;
  /** The close's commit, on a VALID batch. */
  hash?: string;
  lines: string[];
  /** The tool calls it made. */
  spent: number;
}

export interface WaveDeps {
  files: Pick<Files, "read">;
  shell: Pick<Shell, "run">;
  /** Runs one batch under its worktree, the crew's. */
  runBatch(run: BatchRun): Promise<BatchOutcome>;
  /** git's top as an agent under `root` sees it (`git rev-parse --show-toplevel`); throws when the root is refused. */
  probe?(root: string): Promise<{ exitCode: number; top: string }>;
  /** After a GAPS verdict, on the main checkout's paths: the mistakes harvested, its lines. */
  afterGaps?(): Promise<string[]>;
}

/** The driver's log, appended in memory and written by `save` (the line saying it could not, else null). */
export interface WaveLog {
  add(line: string): void;
  entries(): readonly BatchesLogEntry[];
  save(): Promise<string | null>;
}

export interface WaveRequest {
  code: string;
  concurrency: number;
  /** The batches of the wave, in id order, at most `concurrency`. */
  wave: readonly string[];
  workBranch: string;
  /** The work folder and memory.dir, relative to the checkout. */
  work: string;
  memoryDir: string;
  now: Date;
  /** True for the run's first wave: the probe runs before any launch. */
  probe: boolean;
  /** Each batch's sheet file name. */
  sheets: Readonly<Record<string, string>>;
  /** The audits of a batch's verdict file now (the launch's detail). */
  audits(batch: string): number;
  steps(batch: string): number | undefined;
  book: WaveLog;
}

/** `refused`: stopped before any batch ran, the last line saying why. */
export interface WaveResult { lines: string[]; stopped: boolean; refused?: true }

interface Slot { batch: string; place: WorktreePlace; branch: string; made: boolean; reopened: boolean; done: boolean }

const reasonOf = (e: unknown): string => String((e as Error)?.message ?? e).split("\n")[0];
const stop = (lines: string[], line: string): WaveResult => ({ lines: [...lines, line], stopped: true, refused: true });

/** The line naming a kept worktree: a suite run on the main checkout may glob into it. */
export function keptLine(place: WorktreePlace): string {
  return `  worktree ${place.path} kept: a test suite run on the checkout may find its files until it is removed (git worktree remove ${place.path})`;
}

/** The worktree of a batch: made, or reused when its branch exists with the worktree on it. */
async function placeOf(shell: Pick<Shell, "run">, req: WaveRequest, batch: string): Promise<{ ok: true; slot: Slot } | { ok: false; line: string }> {
  const name = batchWorktreeName(req.code, batch);
  const branch = batchBranch(req.code, batch);
  const place = worktreePlace(name);
  if (place === null) return { ok: false, line: `'${name}' is not a worktree name` };
  const reopened = lastEntryOf(req.book.entries(), batch) !== undefined;
  if ((await runGit(shell, gitBranchExists(branch))).exitCode !== 0) {
    const made = await createBatchWorktree(shell, { name, branch, base: req.workBranch });
    return made.ok ? { ok: true, slot: { batch, place, branch, made: true, reopened, done: false } } : { ok: false, line: made.line };
  }
  const head = await runGit(shell, gitWorktreeHead(place.path));
  if (head.exitCode !== 0 || head.stdout.trim() !== `refs/heads/${branch}`) {
    return { ok: false, line: `branch ${branch} exists but ${place.path} is not on it (${head.exitCode === 0 ? head.stdout.trim() : gitReason(head)}): remove the branch or check it out there` };
  }
  return { ok: true, slot: { batch, place, branch, made: false, reopened: true, done: false } };
}

/** A reused worktree whose sheet is done and whose branch holds the close's commit: merged without a run. */
async function closedBefore(deps: WaveDeps, req: WaveRequest, slot: Slot): Promise<boolean> {
  const sheet = req.sheets[slot.batch];
  if (slot.made || sheet === undefined) return false;
  try {
    const text = await deps.files.read(`${slot.place.root}/${req.work}/${req.code}/${sheet}`);
    if (parseBatchSheet(text).doneDate === undefined) return false;
  } catch {
    return false;
  }
  const ahead = await runGit(deps.shell, gitCommitsNotIn(slot.branch, req.workBranch));
  return ahead.exitCode === 0 && Number(ahead.stdout.trim()) > 0;
}

/** The probe's refusal, null when git answers under the worktree with the worktree as its top. */
async function probeRefusal(deps: WaveDeps, req: WaveRequest, place: WorktreePlace): Promise<string | null> {
  if (!req.probe || deps.probe === undefined) return null;
  try {
    const seen = await deps.probe(place.root);
    if (seen.exitCode === 0 && seen.top.trim() === place.root) return null;
  } catch (e) {
    return `BLOCKED — ${reasonOf(e)}`;
  }
  return `BLOCKED — ${concurrencyGitRefusal(req.concurrency)}`;
}

/** The stop's detail of a batch that ended neither VALID nor GAPS. */
function blockedDetail(outcome: BatchOutcome): string {
  const said = outcome.lines.map((l) => l.trim()).find((l) => /^(stopped )?BLOCKED\b/.test(l));
  if (said !== undefined) return `BLOCKED — ${said.replace(/^(stopped )?BLOCKED\s*—?\s*/, "")}`;
  const first = outcome.lines.map((l) => l.trim()).find((l) => l !== "");
  return `BLOCKED — ${first ?? "the batch answered nothing"}`;
}

export async function runWave(req: WaveRequest, deps: WaveDeps): Promise<WaveResult> {
  const lines: string[] = [];
  const slots: Slot[] = [];
  const target = (slot: Slot): SeedTarget & { batch: string } =>
    ({ place: slot.place, work: req.work, code: req.code, memoryDir: req.memoryDir, batch: slot.batch });

  // 1. The worktrees, made or reused; the probe under the first one.
  for (const batch of req.wave) {
    const placed = await placeOf(deps.shell, req, batch);
    if (!placed.ok) return stop(lines, `BLOCKED — worktree: ${placed.line}`);
    slots.push(placed.slot);
    if (placed.slot.made) lines.push(`✓ worktree ${placed.slot.place.path} on ${placed.slot.branch}, from ${req.workBranch}`);
  }
  const refused = slots.length === 0 ? null : await probeRefusal(deps, req, slots[0].place);
  if (refused !== null) {
    for (const slot of slots.filter((s) => s.made)) {
      const removed = await removeBatchWorktree(deps.shell, { name: slot.place.name, branch: slot.branch, into: req.workBranch });
      if (!removed.ok) lines.push(`⚠ ${removed.line}`);
    }
    return stop(lines, refused);
  }

  // 2. Seeded, then the launches logged and written before any batch runs: a killed run finds them.
  for (const slot of slots) {
    slot.done = await closedBefore(deps, req, slot);
    if (slot.done) continue;
    const seeded = await seedWorktree(deps.shell, target(slot));
    if (!seeded.ok) return stop(lines, `BLOCKED — seed: ${seeded.line}`);
  }
  const running = slots.filter((s) => !s.done);
  for (const slot of running) {
    const event = slot.reopened ? "relaunched" : "launched";
    req.book.add(eventLine(req.now, slot.batch, event, `${slot.place.name} audits ${req.audits(slot.batch)}`));
    lines.push(`→ ${slot.batch} ${event} in ${slot.place.path}`);
  }
  for (const slot of slots.filter((s) => s.done)) lines.push(`${slot.batch}: done and committed in ${slot.place.path} before the run stopped`);
  const unsaved = running.length === 0 ? null : await req.book.save();
  if (unsaved !== null) return stop([...lines, unsaved], `BLOCKED — the log must be writable before a launch`);

  // 3. Every batch at once; a rejected run is a stop of its batch alone.
  const settled = await Promise.allSettled(running.map((slot) => deps.runBatch({
    batch: slot.batch, name: slot.place.name, root: slot.place.root, branch: slot.branch,
    ...(req.steps(slot.batch) !== undefined ? { steps: req.steps(slot.batch) } : {}),
  })));
  const outcomes = new Map<string, BatchOutcome>();
  running.forEach((slot, i) => {
    const s = settled[i];
    outcomes.set(slot.batch, s.status === "fulfilled" ? s.value : { batch: slot.batch, verdict: "BLOCKED", lines: [`BLOCKED — ${reasonOf(s.reason)}`], spent: 0 });
  });
  for (const slot of slots.filter((s) => s.done)) outcomes.set(slot.batch, { batch: slot.batch, verdict: "VALID", lines: [], spent: 0 });

  // 4. In id order: merged, harvested and removed; or logged, harvested and kept.
  let stopped = false;
  for (const slot of slots) {
    const outcome = outcomes.get(slot.batch)!;
    const harvest = async () => {
      const back = await harvestBatch(deps.shell, target(slot));
      if (!back.ok) lines.push(back.line);
    };
    if (outcome.verdict === "VALID") {
      const merged = await mergeValidBatch(deps.shell, {
        batch: slot.batch, verdict: "VALID", branch: slot.branch, workBranch: req.workBranch, name: slot.place.name,
      });
      if (!merged.merged) {
        req.book.add(eventLine(req.now, slot.batch, "stopped", `BLOCKED — merge: ${merged.line}`));
        await harvest();
        lines.push(`${slot.batch} stopped BLOCKED — merge: ${merged.line}`, keptLine(slot.place));
        stopped = true;
        continue;
      }
      const tip = await runGit(deps.shell, `git rev-parse --verify ${shellQuote(`refs/heads/${slot.branch}`)}`);
      const hash = tip.exitCode === 0 && tip.stdout.trim() !== "" ? tip.stdout.trim() : outcome.hash ?? "(hash not read)";
      req.book.add(eventLine(req.now, slot.batch, "returned", "VALID"));
      req.book.add(eventLine(req.now, slot.batch, "merged", hash));
      await harvest();
      lines.push(`✓ ${slot.batch} VALID, ${merged.line} (${hash})`);
      const removed = await removeBatchWorktree(deps.shell, { name: slot.place.name, branch: slot.branch, into: req.workBranch });
      lines.push(removed.ok ? removed.line : `⚠ ${removed.line}`);
      continue;
    }
    stopped = true;
    await harvest();
    if (outcome.verdict === "GAPS") {
      req.book.add(eventLine(req.now, slot.batch, "returned", "GAPS"));
      lines.push(`${slot.batch} returned GAPS`, ...outcome.lines.slice(-3).map((l) => `  ${l}`));
      if (deps.afterGaps !== undefined) lines.push(...await deps.afterGaps());
    } else {
      const detail = blockedDetail(outcome);
      req.book.add(eventLine(req.now, slot.batch, "stopped", detail));
      lines.push(`${slot.batch} stopped ${detail}`);
    }
    lines.push(keptLine(slot.place));
  }
  return { lines, stopped };
}
