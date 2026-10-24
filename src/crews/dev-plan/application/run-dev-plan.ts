// /dev-plan's use case: checks the inputs and the checkout, resolves the spec or change
// brief and stops on a Blocking open question before anything else is read, refuses to
// write over a plan unless asked and never over one whose work has started, inventories
// the code by the index, asks the model for the plan as JSON (once more on a refused
// answer), renders and self-checks the plan and its sheets, writes them with plan.json,
// then has the read-only reviewer question the plan once and writes its rows into the
// files. The model writes no file; nothing is written outside the code's folder, and
// nothing under .claude/.
import type { CodeIndex, Files, Llm, Logger, Shell } from "../../../shared/application/ports.ts";
import type { ConfigStore } from "../../../shared/application/config-store.ts";
import { loadDevContext } from "../../../shared/application/dev/load-dev-context.ts";
import { GIT_TOPLEVEL } from "../../../shared/application/dev/resolve-work-folder.ts";
import { readPlanSource, resolvePlanSource } from "../../../shared/application/dev/plan-source.ts";
import type { ResolvedSource } from "../../../shared/application/dev/plan-source.ts";
import { runSubAgent } from "../../../shared/application/agents/run-sub-agent.ts";
import { classifyArtefact, compareBatchIds } from "../../../shared/domain/dev/artefacts.ts";
import { blockingStop } from "../../../shared/domain/dev/spec-format.ts";
import type { PlanSource } from "../../../shared/domain/dev/spec-format.ts";
import { parseBatchSheet, parseGlobalPlan } from "../../../shared/domain/dev/plan-format.ts";
import { planSelfCheck } from "../../../shared/domain/dev/plan-checks.ts";
import { REVIEWER_CHARTER } from "../../../shared/domain/dev/reviewer-charter.ts";
import { REVIEW_ANSWER_SCHEMA, checkReviewAnswer } from "../../../shared/domain/dev/review-answer.ts";
import type { ReviewAnswer } from "../../../shared/domain/dev/review-answer.ts";
import { buildReviewAnswerPrompt, buildReviewBrief, reviewSystem } from "../../../shared/domain/dev/review-prompt.ts";
import { PLAN_ANSWER_SCHEMA, checkPlanAnswer } from "../domain/plan-answer.ts";
import type { PlanAnswer, PlanCheckContext } from "../domain/plan-answer.ts";
import { INVENTORY_CAPS, renderInventory } from "../domain/inventory-model.ts";
import type { Inventory } from "../domain/inventory-model.ts";
import { renderPlan, repoLines } from "../domain/plan-render.ts";
import type { RenderInput, RenderedPlan } from "../domain/plan-render.ts";
import { MAX_PLAN_PROMPT_CHARS, SOURCE_CHARS, buildPlanPrompt } from "./plan-prompt.ts";
import type { PlanPromptInput } from "./plan-prompt.ts";
import { buildInventory } from "./inventory.ts";
import { checkAnchorPaths } from "./anchor-paths.ts";
import type { AnchorListings } from "./anchor-paths.ts";

export interface DevPlanInputs { source?: unknown; replace?: unknown }   // source: the token, null for none
export interface DevPlanDeps {
  files: Files; shell: Pick<Shell, "run">; config: Pick<ConfigStore, "readValue">;
  index: CodeIndex; llm: Pick<Llm, "extract" | "act" | "permissionGateEnabled">;
  log: Logger; clock: () => Date;
}
export const PLAN_JSON = "plan.json";
/** The last line of a plan ready to implement; `{command}` names the harness's step until L-6 ships its own. */
export const END_LINE =
  "→ Read and validate the plan. Then implement batch by batch: {command} (the harness's command until Orkeon Code ships it).";

const WORKSPACE = "/workspace";
const MAX_SOURCE_TOKEN = 300;
const MAX_WARNINGS = 5;
const MAX_PROBLEM_LINES = 12;
const LIST_CAP = 1000;
const MIN_INVENTORY_CHARS = 2_000;
/** Room kept for the problems of a re-ask when the inventory is sized to the prompt. */
const REASK_RESERVE = 4_000;
const GATE_OFF = "the host's permission gate is off; the reviewer was offered read tools only";

const firstLine = (e: unknown): string => (e instanceof Error ? e.message : String(e)).split("\n")[0];
const pad2 = (n: number): string => String(n).padStart(2, "0");
const dateOf = (d: Date): string => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

class WriteFailure extends Error {
  readonly shown: string;
  constructor(shown: string, cause: unknown) {
    super(firstLine(cause));
    this.shown = shown;
  }
}

interface Place { folderVfs: string; folderShown: string; shown: (name: string) => string; vfs: (name: string) => string }

function placeOf(source: ResolvedSource): Place {
  const folderVfs = source.folderShown === "" ? WORKSPACE : `${WORKSPACE}/${source.folderShown}`;
  return {
    folderVfs, folderShown: source.folderShown,
    shown: (name) => (source.folderShown === "" ? name : `${source.folderShown}/${name}`),
    vfs: (name) => `${folderVfs}/${name}`,
  };
}

function checkInputs(input: DevPlanInputs): { source: string | null; replace: boolean } | string {
  const { source, replace } = input;
  if (source !== undefined && source !== null && (typeof source !== "string" || source.length > MAX_SOURCE_TOKEN)) {
    return "dev-plan: invalid crew input: source";
  }
  if (replace !== undefined && typeof replace !== "boolean") return "dev-plan: invalid crew input: replace";
  const token = typeof source === "string" && source.trim() !== "" ? source.trim() : null;
  return { source: token, replace: replace === true };
}

async function toplevelRefusal(shell: Pick<Shell, "run">): Promise<string | null> {
  let top: string;
  try {
    const r = await shell.run(GIT_TOPLEVEL);
    top = r.exitCode === 0 ? r.stdout.trim() : "";
  } catch {
    top = "";
  }
  if (top === WORKSPACE) return null;
  return `dev-plan: run from the checkout at ${WORKSPACE} (git reports ${top === "" ? "no work tree" : top})`;
}

function warningLines(warnings: readonly string[]): string[] {
  const lines = warnings.slice(0, MAX_WARNINGS).map((w) => `warning: ${w}`);
  if (warnings.length > MAX_WARNINGS) lines.push(`  … ${warnings.length - MAX_WARNINGS} more warnings`);
  return lines;
}

function problemLines(problems: readonly string[]): string[] {
  const lines = problems.slice(0, MAX_PROBLEM_LINES).map((p) => `  ${p}`);
  if (problems.length > MAX_PROBLEM_LINES) lines.push(`  … ${problems.length - MAX_PROBLEM_LINES} more`);
  return lines;
}

// ---- an existing plan (§ 2.9) ------------------------------------------------------

type Existing = { ok: true; sheets: string[] } | { ok: false; text: string };

/** What a plan or sheet records as done: a done batch, a ticked box, a ticked TDD line, a done title. */
function workDone(text: string, kind: "plan" | "sheet"): string | null {
  if (kind === "plan") {
    const plan = parseGlobalPlan(text);
    const done = plan.batches.find((b) => b.state.kind === "done");
    if (done) return `batch ${done.id} is done`;
    for (const b of plan.batches) {
      const box = b.steps.find((s) => s.done);
      if (box) return `step ${box.number} of ${b.id} is ticked`;
    }
    return null;
  }
  const sheet = parseBatchSheet(text);
  if (sheet.doneDate !== undefined) return `its title reads done (${sheet.doneDate})`;
  const ticked = sheet.steps.find((s) => s.tdd !== null && (s.tdd.red || s.tdd.green || s.tdd.cost));
  if (ticked) return `the TDD line of step ${ticked.number} is ticked`;
  return null;
}

async function existingPlan(files: Files, place: Place, source: ResolvedSource, replace: boolean): Promise<Existing> {
  let names: string[];
  try {
    names = (await files.list(place.folderVfs, LIST_CAP)).map((n) => n.replace(/\/+$/, ""));
  } catch {
    names = [];
  }
  const own = names
    .map((n) => classifyArtefact(n))
    .filter((a) => a !== null && (a.kind === "plan" || a.kind === "sheet") && a.prefix === source.prefix);
  if (own.length === 0) return { ok: true, sheets: [] };
  const planName = `${source.prefix}-PLAN.md`;
  if (!replace) {
    return {
      ok: false,
      text: `dev-plan: ${place.shown(planName)} exists: /dev-plan ${source.code} --replace writes a new plan over it (nothing is merged)`,
    };
  }
  const sheets: string[] = [];
  for (const a of own) {
    if (a === null) continue;
    let text: string;
    try {
      text = await files.read(place.vfs(a.name));
    } catch (e) {
      return { ok: false, text: `dev-plan: ${place.shown(a.name)} cannot be read (${firstLine(e)}): nothing is replaced` };
    }
    const done = workDone(text, a.kind === "plan" ? "plan" : "sheet");
    if (done !== null) {
      return {
        ok: false,
        text: `dev-plan: ${place.shown(a.name)} records work done (${done}): a started plan is never replaced; plan the rest as a new change`,
      };
    }
    if (a.kind === "sheet") sheets.push(a.name);
  }
  sheets.sort((x, y) => compareBatchIds(classifyArtefact(x)?.batch ?? x, classifyArtefact(y)?.batch ?? y));
  return { ok: true, sheets };
}

// ---- the plan ----------------------------------------------------------------------

interface Planned { answer: PlanAnswer; rendered: RenderedPlan }

async function askPlan(
  deps: DevPlanDeps, promptInput: PlanPromptInput, checkCtx: PlanCheckContext, render: (a: PlanAnswer) => RenderedPlan,
  sourceIds: readonly string[],
): Promise<{ ok: true; planned: Planned } | { ok: false; problems: string[] }> {
  let problems: string[] = [];
  const listings: AnchorListings = new Map();   // one listing per folder for the run, not per attempt
  for (let attempt = 1; attempt <= 2; attempt++) {
    let value: unknown;
    try {
      value = await deps.llm.extract(buildPlanPrompt(promptInput, problems), PLAN_ANSWER_SCHEMA);
    } catch (e) {
      problems = [`the answer did not parse: ${firstLine(e)}`];
      continue;
    }
    const checked = checkPlanAnswer(value, checkCtx);
    if (!checked.ok) { problems = checked.problems; continue; }
    const paths = await checkAnchorPaths(deps.files, checked.value, listings);
    if (paths.length > 0) { problems = paths; continue; }
    const rendered = render(checked.value);
    const self = planSelfCheck({ plan: rendered.plan, sheets: rendered.sheets, sourceIds });
    if (!self.ok) {
      deps.log.warn(`dev-plan: a checked answer rendered a plan that fails its self-check (a renderer defect): ${self.problems[0]}`);
      problems = self.problems;
      continue;
    }
    return { ok: true, planned: { answer: checked.value, rendered } };
  }
  return { ok: false, problems };
}

function planJson(generated: Date, source: ResolvedSource, inventory: Inventory, answer: PlanAnswer, review: ReviewAnswer | null): string {
  return `${JSON.stringify({
    version: 1, generated: generated.toISOString(), source: source.sourceShown, prefix: source.prefix,
    inventory, answer, review,
  }, null, 2)}\n`;
}

async function writeOne(files: Files, place: Place, name: string, content: string): Promise<void> {
  try {
    await files.write(place.vfs(name), content);
  } catch (e) {
    throw new WriteFailure(place.shown(name), e);
  }
}

// ---- the end message (§ 3.3) -------------------------------------------------------

function batchLines(rendered: RenderedPlan, answer: PlanAnswer): string[] {
  const summary = parseGlobalPlan(rendered.plan.text).summary;
  return answer.batches.map((b, k) => {
    const row = summary[k];
    const deps = row === undefined || row.dependsOn.length === 0 ? "—" : row.dependsOn.join(", ");
    return `  F${k + 1} — ${b.name} — ${plural(b.steps.length, "step", "steps")} — ${row?.ids ?? "—"} — depends on ${deps}`;
  });
}

function nextCommand(answer: PlanAnswer, planShown: string): string {
  const roots = answer.batches.map((b, k) => ({ id: `F${k + 1}`, free: b.dependsOn.length === 0 })).filter((b) => b.free);
  const command = roots.length >= 2
    ? `/dev-batches ${roots.map((r) => r.id).join(" ")} ${planShown}`
    : `/dev-implement F1 ${planShown}`;
  return END_LINE.replace("{command}", command);
}

function reviewLines(review: ReviewAnswer): string[] {
  if (review.rows.length === 0) return [`review: ${review.verdict}`];
  const blocking = review.rows.filter((r) => r.severity === "Blocking").length;
  const majors = review.rows.length - blocking;
  const places = new Set<string>();
  if (blocking > 0) places.add("Blocking: § 4");
  for (const r of review.rows) {
    if (r.severity !== "Major") continue;
    places.add(r.target === "plan" ? "plan: § 4" : `${r.target}: under ## Decisions`);
  }
  return [
    `review: ${review.verdict} — ${blocking} Blocking, ${majors} Major (${[...places].join("; ")})`,
    ...review.rows.map((r) => `  ${r.severity} ${r.target} — ${r.question} (${r.evidence})`),
  ];
}

function absentWarning(absent: readonly string[], planName: string, code: string): string[] {
  if (absent.length === 0) return [];
  const where = absent.some((k) => k.startsWith("layout.")) ? "the Commands and Layout lines" : "the Commands line";
  return [`${absent.join(", ")} not in the pack: fill them on ${where} of ${planName} § 1, or add them to ` +
    `.orkeon/repo.yaml and run /dev-plan ${code} --replace`];
}

// ---- the run -----------------------------------------------------------------------

export async function runDevPlan(input: DevPlanInputs, deps: DevPlanDeps): Promise<string> {
  // 1. Inputs.
  const checked = checkInputs(input);
  if (typeof checked === "string") return checked;
  // 2. Checkout.
  const top = await toplevelRefusal(deps.shell);
  if (top !== null) return top;
  // 3. Context.
  const ctx = await loadDevContext(deps);
  // 4. Source.
  const resolution = await resolvePlanSource(deps.files, ctx.work, checked.source);
  if (!resolution.ok) return resolution.text;
  const source = resolution.source;
  const read = await readPlanSource(deps.files, source);
  if (!read.ok) return read.text;
  const parsed: PlanSource = read.parsed;
  // 5. Blocking gate: nothing else is read.
  if (parsed.blocking.length > 0) return blockingStop(source.sourceShown, source.kind, source.code, parsed.blocking);
  // 6. Ids.
  if (parsed.ids.length === 0) return `dev-plan: ${source.sourceShown} names no UC-, BR- or CH- id: nothing to trace`;
  if (source.kind === "change" && parsed.changeKind === undefined) {
    return `dev-plan: ${source.sourceShown}: the title names no kind (bug, refactor or perf)`;
  }
  // 7. Existing plan.
  const place = placeOf(source);
  const existing = await existingPlan(deps.files, place, source, checked.replace);
  if (!existing.ok) return existing.text;

  // 8. Inventory.
  const pack = ctx.pack;
  const built = await buildInventory(deps.index, {
    titles: parsed.ids.map((i) => ({ id: i.id, title: i.title })),
    workShown: ctx.work.folder,
    layout: pack?.pack.layout ?? null,
    buildOutputs: pack?.pack.layout.buildOutputs ?? [],
  }, deps.log);
  if (!built.ok) return built.text;
  const inventory = built.inventory;

  // 9. Prompt.
  const repo = repoLines(pack?.pack ?? null, pack?.shown ?? null);
  const unpinned = parsed.mustNotChange.filter((r) => r.pinnedBy === null).map((r, i) => ({ key: `U${i + 1}`, behaviour: r.behaviour }));
  const pinned = parsed.mustNotChange.flatMap((r) => (r.pinnedBy === null ? [] : [r.pinnedBy]));
  let shownInventory = renderInventory(inventory, INVENTORY_CAPS.promptChars);
  const promptInput: PlanPromptInput = {
    sourceShown: source.sourceShown, kind: source.kind,
    ...(parsed.changeKind === undefined ? {} : { changeKind: parsed.changeKind }),
    sourceText: read.text.slice(0, SOURCE_CHARS),
    ids: parsed.ids, pinned, unpinned,
    repoCommands: repo.commands, repoLayout: repo.layout,
    inventory: shownInventory.text, workShown: ctx.work.folder,
  };
  const fixed = buildPlanPrompt({ ...promptInput, sourceText: "", inventory: "" }, []).length;
  const room = MAX_PLAN_PROMPT_CHARS - fixed - REASK_RESERVE;
  if (shownInventory.text.length > room) {
    shownInventory = renderInventory(inventory, Math.max(MIN_INVENTORY_CHARS, room));
    promptInput.inventory = shownInventory.text;
  }

  // 10. Plan.
  const date = dateOf(deps.clock());
  const sourceIds = parsed.ids.map((i) => i.id);
  const byRef = new Map(inventory.entries.map((e) => [e.ref, e]));
  const renderInput = (answer: PlanAnswer, review: ReviewAnswer | null): RenderInput => ({
    prefix: source.prefix, sourceShown: source.sourceShown, kind: source.kind,
    ...(parsed.changeKind === undefined ? {} : { changeKind: parsed.changeKind }),
    sourceIds: parsed.ids, repo, inventory: byRef, answer, review, date,
  });
  const checkCtx: PlanCheckContext = {
    sourceIds, shownRefs: shownInventory.shown, refPaths: new Map(inventory.entries.map((e) => [e.ref, e.path])),
    refNames: new Map(inventory.entries.map((e) => [e.ref, e.name])),
    kind: source.kind, ...(parsed.changeKind === undefined ? {} : { changeKind: parsed.changeKind }),
    pinned, unpinned: unpinned.map((u) => u.key), workFolder: ctx.work.folder,
  };
  const asked = await askPlan(deps, promptInput, checkCtx, (a) => renderPlan(renderInput(a, null)), sourceIds);
  if (!asked.ok) {
    return ["dev-plan: the plan was refused twice; nothing is written.", ...problemLines(asked.problems)].join("\n");
  }
  const { answer } = asked.planned;
  let rendered = asked.planned.rendered;

  // 10b. A replace with fewer batches would leave stale sheets: refused before any write.
  if (existing.sheets.length > answer.batches.length) {
    const extra = existing.sheets.slice(answer.batches.length).map((n) => place.shown(n));
    return `dev-plan: the new plan has ${answer.batches.length} batches and the previous one ${existing.sheets.length}; ` +
      `Orkeon Code cannot delete a file: remove ${extra.join(", ")} by hand, then /dev-plan ${source.code} --replace. Nothing is written.`;
  }

  // 11. Write.
  const generated = deps.clock();
  try {
    await writeOne(deps.files, place, rendered.plan.name, rendered.plan.text);
    for (const s of rendered.sheets) await writeOne(deps.files, place, s.name, s.text);
    await writeOne(deps.files, place, PLAN_JSON, planJson(generated, source, inventory, answer, null));
  } catch (e) {
    const shown = e instanceof WriteFailure ? e.shown : "a file";
    return `dev-plan: ${shown} could not be written (${firstLine(e)}); the files before it are written`;
  }
  const planShown = place.shown(rendered.plan.name);
  deps.log.info(`dev-plan: ${planShown} and ${rendered.sheets.length} sheets written`);

  // 12. Review.
  const warnings = [...ctx.warnings, ...inventory.warnings, ...absentWarning(repo.absent, rendered.plan.name, source.code)];
  if (deps.llm.permissionGateEnabled() === false) warnings.push(GATE_OFF);
  const targets = ["plan", ...answer.batches.map((_, k) => `F${k + 1}`)];
  const outcome = await runSubAgent(deps.llm, {
    charter: REVIEWER_CHARTER,
    system: reviewSystem("plan"),
    brief: buildReviewBrief({
      mode: "plan", folder: place.folderShown === "" ? "." : place.folderShown,
      files: [planShown, ...rendered.sheets.map((s) => place.shown(s.name))],
      source: source.sourceShown, inventory: shownInventory.text, targets,
    }),
    schema: REVIEW_ANSWER_SCHEMA,
    answerPrompt: buildReviewAnswerPrompt,
    check: (v) => checkReviewAnswer(v, { targets }),
  });

  // 13. Review rows into the files; the review is never run again.
  let review: ReviewAnswer | null = null;
  let reviewText: string[];
  if (!outcome.ok) {
    reviewText = [`review: not run (${outcome.reason}: ${outcome.problems[0] ?? "no detail"})`];
  } else {
    review = outcome.value;
    reviewText = reviewLines(review);
    try {
      if (review.rows.length > 0) {
        const reviewed = renderPlan(renderInput(answer, review));
        const self = planSelfCheck({ plan: reviewed.plan, sheets: reviewed.sheets, sourceIds });
        if (!self.ok) {
          return [
            `dev-plan: the reviewed plan fails its self-check; the files written before the review stay as they are.`,
            ...problemLines(self.problems),
            "review rows that could not be written:",
            ...review.rows.map((r) => `  ${r.severity} ${r.target} — ${r.question} (${r.evidence})`),
          ].join("\n");
        }
        if (reviewed.plan.text !== rendered.plan.text) await writeOne(deps.files, place, reviewed.plan.name, reviewed.plan.text);
        for (const [k, s] of reviewed.sheets.entries()) {
          if (s.text !== rendered.sheets[k].text) await writeOne(deps.files, place, s.name, s.text);
        }
        rendered = reviewed;
      }
      await writeOne(deps.files, place, PLAN_JSON, planJson(generated, source, inventory, answer, review));
    } catch (e) {
      const shown = e instanceof WriteFailure ? e.shown : "a file";
      return `dev-plan: ${shown} could not be written (${firstLine(e)}); the files before it are written`;
    }
  }

  // 15. End message.
  const ids = sourceIds.join(", ");
  const lines = [
    `dev-plan: ${planShown} — ${plural(answer.batches.length, "batch", "batches")}, ${plural(sourceIds.length, "id", "ids")} traced (${ids})`,
    ...batchLines(rendered, answer),
    `files: ${[planShown, ...rendered.sheets.map((s) => s.name), PLAN_JSON].join(", ")}`,
    `inventory: ${inventory.entries.length} entries from ${inventory.titlesSearched} titles (index ${inventory.index}, ${inventory.calls} calls)`,
    ...reviewText,
    ...warningLines(warnings),
  ];
  const blocking = review?.rows.filter((r) => r.severity === "Blocking").length ?? 0;
  if (blocking > 0) {
    const settle = source.kind === "change" ? "the change brief: /dev-change" : "the spec: /dev-spec";
    lines.push(
      `dev-plan: the plan is blocked: ${plural(blocking, "Blocking question", "Blocking questions")} in ${planShown} § 4; every batch reads — blocked.`,
      `→ Answer ${blocking === 1 ? "it" : "them"} in ${settle} ${source.code} (the harness's until Orkeon Code ships it), then /dev-plan ${source.code} --replace. Do not implement before.`,
    );
  } else if (!outcome.ok) {
    lines.push(`→ The plan is written but unreviewed: read it closely before implementing, or /dev-plan ${source.code} --replace to plan and review again.`);
  } else {
    lines.push(nextCommand(answer, planShown));
  }
  return lines.join("\n");
}
