// /dev-batches: one run of the driver of a plan's batches (temp/04 L-7). It reads the plan, its sheets, its
// verdicts and its log, `.orkeon/dev/<code>/batches-state.md`; back from a batch's chain (`after`: the last
// lines of what /dev-implement or /dev-verify answered) it logs what came of that batch; then either it
// stops (a human decides), or it closes the plan (every batch done: one push, one pull request), or it runs
// the preflight, the review of a batch whose dependencies just closed, and names the next batch for the
// command to launch: JSON `{ lines, next?: { crew: "dev-implement", input } }`. A run that names its code
// keeps it, with what the command read at its dispatch, in `.orkeon/dev/batches-active.json`; the runs the
// chain launches name none and read it back. The batch's own work (its steps, its audit, its commit) is
// /dev-implement's: this crew writes only the log, the run record and the pull request's body.
import type { Files, Llm, Logger, Shell } from "../../../shared/application/ports.ts";
import type { ConfigStore } from "../../../shared/application/config-store.ts";
import type { PullRequestOpener } from "../../../shared/application/git/commit-files.ts";
import { defaultBranch, runGit } from "../../../shared/application/git/commit-files.ts";
import { loadDevCode, loadDevContext } from "../../../shared/application/dev/load-dev-context.ts";
import type { DevCode } from "../../../shared/application/dev/load-dev-context.ts";
import { preflight } from "../../../shared/application/dev/preflight.ts";
import { runSubAgent } from "../../../shared/application/agents/run-sub-agent.ts";
import { isCode } from "../../../shared/domain/dev/artefacts.ts";
import { parseBatchesState } from "../../../shared/domain/dev/batches-state.ts";
import type { BatchesLogEntry } from "../../../shared/domain/dev/batches-state.ts";
import { lastVerdict } from "../../../shared/domain/dev/verdict-format.ts";
import { REVIEWER_CHARTER } from "../../../shared/domain/dev/reviewer-charter.ts";
import { REVIEW_ANSWER_SCHEMA, checkReviewAnswer } from "../../../shared/domain/dev/review-answer.ts";
import { buildReviewAnswerPrompt, buildReviewBrief, reviewSystem } from "../../../shared/domain/dev/review-prompt.ts";
import { parseSessionRules } from "../../../shared/domain/git/pull-request.ts";
import { GIT_CURRENT_BRANCH_COMMAND, GIT_HEAD_COMMAND, shellQuote } from "../../../shared/domain/git/close.ts";
import { policyFor } from "../../../shared/domain/agent-policy/mode-policy.ts";
import { nextBatch, waveOrder } from "../domain/wave-order.ts";
import type { BatchNode } from "../domain/wave-order.ts";
import { appendToLog, batchesLogPath, closedLine, eventLine, lastEntryOf } from "../domain/batches-log.ts";
import type { BatchEvent } from "../domain/batches-log.ts";
import { closePlan } from "./plan-close.ts";
import type { MergedBatch } from "./plan-close.ts";

export const ACTIVE_RECORD = "/workspace/.orkeon/dev/batches-active.json";
const AFTER_LINES = 20;

/** What the dispatch read and a chained run cannot: the session's mode and rules, the github tool, the
 *  /hooks registry, the /effort level, and `memoryRecall: false` when a session rule denies it. */
export interface BatchesContext {
  permissionMode: string; permissionRules: string[]; githubTool: boolean;
  hooks: unknown[]; effort: string | null; memoryRecall?: false;
}

export interface DevBatchesInputs {
  /** The work code; absent, the run the record names goes on. */
  code?: unknown;
  pr?: unknown;
  /** The last lines of what the batch's chain answered: this run logs what came of it. */
  after?: unknown;
  permissionMode?: unknown; permissionRules?: unknown; githubTool?: unknown;
  hooks?: unknown; effort?: unknown; memoryRecall?: unknown;
}

export interface DevBatchesDeps {
  files: Files; shell: Shell; config: Pick<ConfigStore, "readValue">; log: Pick<Logger, "info" | "warn">;
  clock: () => Date;
  /** The reviewer of the next batch (read tools only); none: the review is not run, and said. */
  reviewer?: Pick<Llm, "act" | "extract">;
  /** The pull-request opener for the context read at the dispatch; none: the command is handed over. */
  openerFor?(context: BatchesContext): PullRequestOpener | undefined;
}

export interface BatchesAnswer {
  lines: string[];
  next?: { crew: "dev-implement"; input: Record<string, unknown> };
}

interface ActiveRecord { code: string | null; pr: boolean; context: BatchesContext }

const answer = (lines: string[], next?: BatchesAnswer["next"]): string =>
  JSON.stringify(next === undefined ? { lines } : { lines, next });
const flag = (v: unknown): boolean => v === true || v === "true";
const reasonOf = (e: unknown): string => String((e as Error)?.message ?? e).split("\n")[0];
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

function contextOf(raw: DevBatchesInputs | Record<string, unknown>): BatchesContext {
  const r = raw as DevBatchesInputs;
  return {
    permissionMode: typeof r.permissionMode === "string" ? r.permissionMode : "",
    permissionRules: strings(r.permissionRules),
    githubTool: flag(r.githubTool),
    hooks: Array.isArray(r.hooks) ? r.hooks : [],
    effort: typeof r.effort === "string" && r.effort !== "" ? r.effort : null,
    ...(r.memoryRecall === false ? { memoryRecall: false as const } : {}),
  };
}

async function readRecord(files: Pick<Files, "read">): Promise<ActiveRecord | null> {
  try {
    const parsed = JSON.parse(await files.read(ACTIVE_RECORD)) as { code?: unknown; pr?: unknown; context?: unknown };
    const code = typeof parsed.code === "string" && isCode(parsed.code) ? parsed.code : null;
    const context = parsed.context !== null && typeof parsed.context === "object" ? parsed.context as Record<string, unknown> : {};
    return { code, pr: parsed.pr === true, context: contextOf(context) };
  } catch {
    return null;
  }
}

/** The log, appended in memory and written once per run. */
class LogBook {
  readonly path: string;
  readonly code: string;
  text: string | null;
  private readonly added: string[] = [];
  constructor(path: string, code: string, text: string | null) { this.path = path; this.code = code; this.text = text; }
  add(line: string): void { this.added.push(line); }
  entries(): BatchesLogEntry[] { return parseBatchesState(appendToLog(this.text, this.code, this.added)).entries; }
  closed(): boolean { return parseBatchesState(appendToLog(this.text, this.code, this.added)).closed; }
  /** Writes what was added; the line saying it could not, else null. */
  async save(files: Pick<Files, "write">): Promise<string | null> {
    if (this.added.length === 0) return null;
    try {
      await files.write(this.path, appendToLog(this.text, this.code, this.added));
      return null;
    } catch (e) {
      return `⚠ the log ${this.path.replace(/^\/workspace\//, "")} could not be written: ${reasonOf(e)}`;
    }
  }
}

const OPENING: ReadonlySet<string> = new Set(["launched", "relaunched"]);

/** The batches as the order sees them: their dependencies (the summary row's, else the sheet's) and whether done. */
export function batchNodes(dev: DevCode): BatchNode[] {
  const plan = dev.plan?.plan;
  if (!plan) return [];
  return plan.batches.map((b) => {
    const row = plan.summary.find((r) => r.id === b.id);
    const sheet = dev.sheets.find((s) => s.batch === b.id)?.sheet;
    return {
      id: b.id,
      dependsOn: row !== undefined ? row.dependsOn : sheet?.dependsOn ?? [],
      done: b.state.kind === "done" || sheet?.doneDate !== undefined,
    };
  });
}

/** What came of a batch the chain ran and did not close: the event logged, the line said. */
function stopOf(dev: DevCode, batch: string, after: readonly string[]): { event: BatchEvent; detail: string } {
  const blocked = after.map((l) => l.trim()).find((l) => l.startsWith("BLOCKED"));
  if (blocked !== undefined) return { event: "stopped", detail: `BLOCKED — ${blocked.replace(/^BLOCKED\s*—?\s*/, "")}` };
  const verdicts = dev.verdicts.filter((v) => v.batch === batch);
  const verdict = verdicts.length === 0 ? null : lastVerdict(verdicts[verdicts.length - 1].file);
  if (verdict?.verdict === "GAPS") return { event: "returned", detail: "GAPS" };
  if (verdict?.verdict === "VALID") {
    const failed = after.map((l) => l.trim()).find((l) => l.startsWith("✗"));
    return { event: "stopped", detail: `BLOCKED — close: ${failed?.replace(/^✗\s*/, "") ?? "the batch was not committed"}` };
  }
  const first = after.map((l) => l.trim()).find((l) => l !== "");
  return { event: "stopped", detail: `BLOCKED — ${first ?? "the chain answered nothing"}` };
}

const BRANCH_WORD = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** The work branch of a run: the pattern's first alternative before `/`, then the code. */
export function batchesBranchName(pattern: string, code: string): string | null {
  const slash = pattern.indexOf("/");
  if (slash <= 0) return null;
  const prefix = pattern.slice(0, slash).split("|")[0].trim();
  return BRANCH_WORD.test(prefix) ? `${prefix}/${code}` : null;
}

/** On the default branch with `contrib.branch`, the run's work branch is created; the line, or the refusal. */
async function ensureWorkBranch(
  shell: Pick<Shell, "run">, pattern: string | undefined, code: string,
): Promise<{ ok: true; line: string | null } | { ok: false; line: string }> {
  const wanted = pattern?.trim();
  if (!wanted) return { ok: true, line: null };
  const current = await runGit(shell, GIT_CURRENT_BRANCH_COMMAND);
  const branch = current.exitCode === 0 ? current.stdout.trim() : "";
  const base = await defaultBranch(shell);
  if (branch === "" || base === null || branch !== base) return { ok: true, line: null };
  const name = batchesBranchName(wanted, code);
  if (name === null) return { ok: false, line: `no branch name can be made from contrib.branch '${wanted}' (<prefix>/<slug>): create the work branch` };
  const exists = await runGit(shell, `git rev-parse --verify --quiet ${shellQuote(`refs/heads/${name}`)}`);
  if (exists.exitCode === 0) return { ok: false, line: `${branch} is the default branch and ${name} exists already: switch to it (git switch ${name})` };
  const made = await runGit(shell, `git switch -c ${shellQuote(name)}`);
  if (made.exitCode !== 0) {
    return { ok: false, line: `git switch -c ${name} failed (${(made.stderr || made.stdout).trim().split("\n")[0] || `exit ${made.exitCode}`})` };
  }
  return { ok: true, line: `✓ branch ${name} created from ${branch} (contrib.branch ${wanted})` };
}

/** The closed batches a review is told about: each one's commit and its files. */
async function closedInventory(shell: Pick<Shell, "run">, merged: readonly MergedBatch[], deps: readonly string[]): Promise<string> {
  const out: string[] = [];
  for (const m of merged.filter((x) => deps.includes(x.batch))) {
    if (!/^[0-9a-f]{4,40}$/i.test(m.hash)) continue;
    const r = await runGit(shell, `git show --name-only --format= ${shellQuote(m.hash)}`);
    const files = r.exitCode === 0 ? r.stdout.split("\n").map((l) => l.trim()).filter((l) => l !== "") : [];
    out.push(`${m.batch} ${m.hash}: ${files.slice(0, 20).join(", ") || "(files not read)"}${files.length > 20 ? `, and ${files.length - 20} more` : ""}`);
  }
  return out.join("\n");
}

function mergedOf(entries: readonly BatchesLogEntry[]): MergedBatch[] {
  const out = new Map<string, string>();
  for (const e of entries) if (e.batch !== undefined && e.event === "merged") out.set(e.batch, e.detail.split(" ")[0] ?? "");
  return [...out].map(([batch, hash]) => ({ batch, hash }));
}

export async function runDevBatches(input: DevBatchesInputs, deps: DevBatchesDeps): Promise<string> {
  const lines: string[] = [];
  // 1. The run: the code named, kept with the dispatch's context; else the one the record names.
  let code: string;
  let pr: boolean;
  let context: BatchesContext;
  if (typeof input.code === "string" && input.code.trim() !== "") {
    code = input.code.trim();
    if (!isCode(code)) return answer([`BLOCKED — '${code}' is not a work code (a folder name of the work folder)`]);
    pr = flag(input.pr);
    context = contextOf(input);
    try {
      await deps.files.write(ACTIVE_RECORD, `${JSON.stringify({ code, pr, context }, null, 2)}\n`);
    } catch (e) {
      lines.push(`⚠ the run record could not be written (${reasonOf(e)}): after a refused hop, type /dev-batches ${code}`);
    }
  } else {
    const record = await readRecord(deps.files);
    if (record === null || record.code === null) {
      return answer(["no /dev-batches run to go on with: /dev-batches <code>"]);
    }
    code = record.code;
    pr = record.pr || flag(input.pr);
    context = record.context;
  }
  const mode = context.permissionMode.trim();
  if (mode !== "" && policyFor(mode).readOnly) {
    return answer([...lines, `BLOCKED — the session mode ${mode} is read-only: the batches write files and commit (/mode default, then /dev-batches ${code})`]);
  }

  // 2. The plan and what was done of it.
  const ctx = await loadDevContext({ files: deps.files, shell: deps.shell, config: deps.config });
  lines.push(...ctx.warnings.slice(0, 5).map((w) => `⚠ ${w}`));
  if (ctx.work.vfsPath === null) return answer([...lines, `BLOCKED — the work folder ${ctx.work.folder} is outside the mounts`]);
  const lookup = await loadDevCode({ files: deps.files }, ctx.work, code);
  if (lookup.found === null) {
    const known = lookup.codes.length > 0 ? ` (codes: ${lookup.codes.slice(0, 10).join(", ")})` : "";
    return answer([...lines, `BLOCKED — no plan under ${ctx.work.folder}/${code}/${known}: /dev-plan first`]);
  }
  const dev = lookup.found;
  const nodes = batchNodes(dev);
  const order = waveOrder(nodes);
  const now = deps.clock();
  const logPath = batchesLogPath(code);
  let logText: string | null = null;
  try {
    logText = await deps.files.read(logPath);
  } catch {
    logText = null;
  }
  const book = new LogBook(logPath, code, logText);
  const logShown = logPath.replace(/^\/workspace\//, "");
  const finish = async (out: string[], next?: BatchesAnswer["next"]): Promise<string> => {
    const failed = await book.save(deps.files);
    return answer(failed === null ? out : [...out, failed], next);
  };

  // 3. What came of the batches the log leaves launched: a batch done since is logged returned and merged;
  //    back from the chain, a batch not done is a stop (a human decides).
  const after = strings(input.after).slice(-AFTER_LINES);
  for (const node of nodes) {
    const last = lastEntryOf(book.entries(), node.id);
    if (last === undefined || !OPENING.has(last.event)) continue;
    if (node.done) {
      const head = await runGit(deps.shell, GIT_HEAD_COMMAND);
      book.add(eventLine(now, node.id, "returned", "VALID"));
      book.add(eventLine(now, node.id, "merged", head.exitCode === 0 ? head.stdout.trim() : "(hash not read)"));
      lines.push(`✓ ${node.id} done and committed`);
      continue;
    }
    if (input.after === undefined) continue;
    const stop = stopOf(dev, node.id, after);
    book.add(eventLine(now, node.id, stop.event, stop.detail));
    return finish([
      ...lines, `${node.id} ${stop.event} ${stop.detail}`,
      `→ a human decides; then /dev-batches ${code} goes on (${node.id} again, from its sheet's ticks)`,
    ]);
  }

  // 4. Every batch done: the close of the plan, once.
  const next = order.ok ? nextBatch(order.order, nodes) : null;
  if (order.ok && next === null) {
    if (book.closed()) return finish([...lines, `${code}: every batch is done and the run is closed (${logShown})`]);
    const opener = context.githubTool ? deps.openerFor?.(context) : undefined;
    const close = await closePlan(
      { files: deps.files, shell: deps.shell, config: deps.config, opener },
      { code, dev, pack: ctx.pack?.pack ?? null, work: ctx.work, merged: mergedOf(book.entries()), pr, rules: parseSessionRules(context.permissionRules) },
    );
    lines.push(...close.lines);
    if (close.closed) {
      book.add(closedLine(now));
      try {
        await deps.files.write(ACTIVE_RECORD, `${JSON.stringify({ code: null }, null, 2)}\n`);
      } catch { /* a stale record names a closed run: the next /dev-batches without a code says so */ }
      lines.push(`→ ${code}: every batch done, the run closed (${logShown})`);
    }
    return finish(lines);
  }

  // 5. Preflight.
  const plan = dev.plan;
  const sheetOf = (batch: string) => dev.sheets.find((s) => s.batch === batch);
  const pre = await preflight({ shell: deps.shell }, {
    planShown: plan === null ? null : `${dev.shown}/${plan.name}`,
    problems: dev.warnings,
    batches: nodes.length,
    missingSheets: nodes.filter((n) => !n.done && sheetOf(n.id) === undefined).map((n) => n.id),
    order,
    workFolder: ctx.work.folder,
  });
  lines.push(...pre.lines);
  if (!pre.ok || next === null || plan === null) {
    return finish([...lines, `BLOCKED — preflight: settle each ✗ above, then /dev-batches ${code}`]);
  }

  // 6. The review of a batch whose dependencies just closed, before its first launch.
  const node = nodes.find((n) => n.id === next)!;
  const entry = lastEntryOf(book.entries(), next);
  if (entry === undefined && node.dependsOn.length > 0) {
    const sheet = sheetOf(next)!;
    if (deps.reviewer === undefined) {
      lines.push(`review of ${next}: not run (no reviewer on this host)`);
    } else {
      const outcome = await runSubAgent(deps.reviewer, {
        charter: REVIEWER_CHARTER,
        system: reviewSystem("next-batch"),
        brief: buildReviewBrief({
          mode: "next-batch", folder: dev.shown, files: [`${dev.shown}/${sheet.name}`], source: `${dev.shown}/${plan.name}`,
          inventory: await closedInventory(deps.shell, mergedOf(book.entries()), node.dependsOn), targets: [next],
        }),
        schema: REVIEW_ANSWER_SCHEMA,
        answerPrompt: buildReviewAnswerPrompt,
        check: (v) => checkReviewAnswer(v, { targets: [next] }),
      });
      if (!outcome.ok) {
        lines.push(`review of ${next}: not run (${outcome.reason}: ${outcome.problems[0] ?? "no detail"})`);
      } else {
        const rows = outcome.value.rows;
        const blocking = rows.filter((r) => r.severity === "Blocking");
        lines.push(rows.length === 0
          ? `review of ${next}: CLEAR`
          : `review of ${next}: GAPS — ${blocking.length} Blocking, ${rows.length - blocking.length} Major`);
        lines.push(...rows.map((r) => `  ${r.severity} — ${r.question} (${r.evidence})`));
        if (blocking.length > 0) {
          book.add(eventLine(now, next, "stopped", `BLOCKED — review: ${blocking.length} Blocking`));
          return finish([
            ...lines,
            `→ ${next} not launched: settle the Blocking questions in ${dev.shown}/${sheet.name} (or /dev-plan), then /dev-batches ${code} launches it without a second review`,
          ]);
        }
      }
    }
  }

  // 7. The work branch, then the launch.
  const branch = await ensureWorkBranch(deps.shell, ctx.pack?.pack.contrib.branch, code);
  if (!branch.ok) return finish([...lines, `BLOCKED — branch: ${branch.line}, then /dev-batches ${code}`]);
  if (branch.line !== null) lines.push(branch.line);
  const relaunch = entry !== undefined;
  book.add(eventLine(now, next, relaunch ? "relaunched" : "launched"));
  const sheet = sheetOf(next)!.sheet;
  const openSteps = sheet.steps.filter((s) => s.tdd !== null && !(s.tdd.red && s.tdd.green && s.tdd.cost)).length;
  const position = order.ok ? order.order.indexOf(next) + 1 : 0;
  return finish(
    [...lines, `→ ${next} ${relaunch ? "relaunched" : "launched"} (${position}/${nodes.length}): /dev-implement ${next} ${code}, then its audit and its commit`],
    {
      crew: "dev-implement",
      input: {
        batch: next, plan: code, hooks: context.hooks, effort: context.effort,
        permissionMode: context.permissionMode, permissionRules: context.permissionRules, githubTool: context.githubTool,
        ...(context.memoryRecall === false ? { memoryRecall: false } : {}),
        ...(openSteps > 0 ? { steps: openSteps } : {}),
      },
    },
  );
}
