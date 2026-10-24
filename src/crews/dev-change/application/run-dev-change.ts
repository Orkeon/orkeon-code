// /dev-change's use case: checks the inputs and the checkout, finds the code's folder (a spec there refuses: one
// source per code), reads the origin whole, runs the reproduction of a bug or the measurement of a perf change
// before anything else is written (a bug that does not fail stops), inventories the code by the index, asks the
// model for the brief as JSON (once more on a refused answer; a request that is a feature is sent to /dev-spec),
// renders, self-checks and writes CHANGE-<code>.md, then asks its open questions through human_input - each answer
// written before the next question - folds them in, and has the read-only reviewer question the brief once. With
// nobody to answer, the questions stay in the file and the run ends BLOCKED. An existing brief is revised.
import type { CodeIndex, Files, HumanInput, Llm, Logger, Shell } from "../../../shared/application/ports.ts";
import type { ConfigStore } from "../../../shared/application/config-store.ts";
import { loadDevContext } from "../../../shared/application/dev/load-dev-context.ts";
import { briefInventory, briefPhrases, renderBriefInventory } from "../../../shared/application/dev/brief-inventory.ts";
import type { BriefInventory } from "../../../shared/application/dev/brief-inventory.ts";
import { questionRound } from "../../../shared/application/dev/question-round.ts";
import type { Folded, RoundState } from "../../../shared/application/dev/question-round.ts";
import { reviewLine, reviewSource } from "../../../shared/application/dev/source-review.ts";
import type { SourceReviewOutcome } from "../../../shared/application/dev/source-review.ts";
import {
  codeFolder, dateOf, firstLine, inputCode, inputText, openLine, plural, problemLines, sourceSelfCheck, toplevelRefusal,
  warningLines,
} from "../../../shared/application/dev/source-step.ts";
import { numberQuestions, parseDecisions, parseOpenQuestions } from "../../../shared/domain/dev/questions.ts";
import type { Decision, Question } from "../../../shared/domain/dev/questions.ts";
import { parsePlanSource } from "../../../shared/domain/dev/spec-format.ts";
import type { ChangeKind } from "../../../shared/domain/dev/spec-format.ts";
import { CHANGE_ANSWER_SCHEMA, checkChangeAnswer, criterionId, pinOnlyKnown } from "../domain/change-answer.ts";
import {
  CHANGE_DECISIONS_SECTION, CHANGE_QUESTIONS_SECTION, EVIDENCE_HEADING, ORIGIN_HEADING, changeFileName, originLines,
  renderChange, reproFileName, sectionBody,
} from "../domain/change-render.ts";
import { buildChangePrompt } from "./change-prompt.ts";
import type { ChangePromptInput } from "./change-prompt.ts";
import { factLines, pickCommand, readOrigin, reproFile, runEvidence, runStop } from "./evidence.ts";

export interface DevChangeInputs { code?: unknown; kind?: unknown; run?: unknown; text?: unknown }
export interface DevChangeDeps {
  files: Files; shell: Pick<Shell, "run">; config: Pick<ConfigStore, "readValue">; index: CodeIndex;
  llm: Pick<Llm, "extract" | "act" | "permissionGateEnabled">; human: HumanInput; log: Logger; clock: () => Date;
}

const STEP = "dev-change";
const KINDS: readonly ChangeKind[] = ["bug", "refactor", "perf"];
const HEADINGS = { questions: CHANGE_QUESTIONS_SECTION, decisions: CHANGE_DECISIONS_SECTION };
export const DEV_CHANGE_NEXT = "→ Next step, once you have validated the brief: /dev-plan {code}";
export const FEATURE_LINE = "→ This is a feature, not a change of what exists: /dev-spec {code}";

type Drafted = { feature: true } | { feature: false; text: string; open: Question[]; unknown: string[] };

/** True when the inventory shows a test of that name (a path or a symbol holding it). */
const knownIn = (inventory: BriefInventory) => (name: string): boolean =>
  inventory.entries.some((e) => e.name.includes(name) || name.includes(e.name) || e.path.includes(name));

export async function runDevChange(input: DevChangeInputs, deps: DevChangeDeps): Promise<string> {
  // 1. Inputs and checkout.
  const code = inputCode(STEP, input.code);
  if (typeof code !== "string") return code.refused;
  const kindIn = inputText(STEP, "kind", input.kind);
  if (typeof kindIn !== "string" || (kindIn !== "" && !KINDS.includes(kindIn as ChangeKind))) return `${STEP}: invalid crew input: kind`;
  const given = inputText(STEP, "run", input.run);
  if (typeof given !== "string") return given.refused;
  const typed = inputText(STEP, "text", input.text);
  if (typeof typed !== "string") return typed.refused;
  const top = await toplevelRefusal(STEP, deps.shell);
  if (top !== null) return top;
  const ctx = await loadDevContext(deps);
  const folder = await codeFolder(STEP, deps.files, ctx.work, code);
  if ("refused" in folder) return folder.refused;

  // 2. One source per code; an existing brief is revised, its kind kept.
  if (folder.names.includes(`SPEC-${code}.md`)) {
    return `${STEP}: ${folder.shown}/SPEC-${code}.md exists: a code has one source; revise it with /dev-spec ${code}, or pick another code`;
  }
  const brief = folder.file(changeFileName(code));
  let existing: string | null = null;
  if (folder.names.includes(changeFileName(code))) {
    try {
      existing = await deps.files.read(brief.vfs);
    } catch (e) {
      return `${STEP}: ${brief.shown} cannot be read (${firstLine(e)}); nothing is written`;
    }
  }
  const fileKind = existing === null ? undefined : parsePlanSource(existing, "change").changeKind;
  if (existing !== null && fileKind === undefined) return `${STEP}: ${brief.shown}: the title names no kind (bug, refactor or perf); fix the title first`;
  if (fileKind !== undefined && kindIn !== "" && kindIn !== fileKind) {
    return `${STEP}: ${brief.shown} is a ${fileKind} change: a brief keeps its kind; pick another code for a ${kindIn}`;
  }
  const kind = (fileKind ?? kindIn) as ChangeKind | "";
  if (kind === "") return `${STEP}: name the kind: /dev-change ${code} bug|refactor|perf [--run "<command>"] <origin>`;
  if (given !== "" && kind === "refactor") return `${STEP}: --run is for a bug or a perf change; a refactor is pinned by its tests`;

  // 3. The origin (a new brief) or the request (a revision).
  let originText = "";
  let originFrom = "";
  let request = "";
  if (existing === null) {
    if (typed === "") return `${STEP}: a new brief needs its origin: /dev-change ${code} ${kind} <#issue | path | text>`;
    const origin = await readOrigin(STEP, deps, typed);
    if ("refused" in origin) return origin.refused;
    originText = origin.text;
    originFrom = origin.from;
  } else {
    request = typed;
    originText = sectionBody(existing, ORIGIN_HEADING).map((l) => l.replace(/^> ?/, "")).join("\n");
  }

  // 4. Evidence by running, before anything else is written.
  const today = dateOf(deps.clock());
  const commands = ctx.pack?.pack.commands ?? {};
  let facts: string[] = existing === null ? [] : sectionBody(existing, EVIDENCE_HEADING).filter((l) => !l.startsWith("- **Suspected cause**"));
  let ran: { command: string; seconds: number } | null = null;
  if (kind !== "refactor" && (existing === null || given !== "")) {
    const picked = await pickCommand(STEP, deps.llm, kind, given, originText, commands);
    if ("refused" in picked) return picked.refused;
    const result = await runEvidence(deps.shell, picked.command, deps.clock);
    const repro = folder.file(reproFileName(code));
    try {
      await deps.files.write(repro.vfs, reproFile(result, today));
    } catch (e) {
      return `${STEP}: ${repro.shown} could not be written (${firstLine(e)}); nothing else is written`;
    }
    const stop = runStop(STEP, kind, result, repro.shown);
    if (stop !== null) return stop;
    facts = factLines(kind, result, reproFileName(code));
    ran = { command: result.command, seconds: result.seconds };
  }

  // 5. Inventory by code.
  const inventory = await briefInventory(deps.index, {
    phrases: briefPhrases(code, `${originText}\n${request}`),
    excluded: [ctx.work.folder, ...(ctx.pack?.pack.layout.buildOutputs ?? [])],
  });
  const inventoryText = renderBriefInventory(inventory);
  const warnings = [...ctx.warnings, ...inventory.warnings];
  const origin = existing === null ? originLines(originText, originFrom) : sectionBody(existing, ORIGIN_HEADING);

  // 6. Draft: checked, the unknown pins made unpinned, rendered, read back.
  const ask = async (prompt: ChangePromptInput, open: (q: ReturnType<typeof checkChangeAnswer>) => Question[], decisions: readonly Decision[]):
    Promise<{ ok: true; drafted: Drafted } | { ok: false; problems: string[] }> => {
    let problems: string[] = [];
    for (let attempt = 1; attempt <= 2; attempt++) {
      let value: unknown;
      try {
        value = await deps.llm.extract(buildChangePrompt(prompt, problems), CHANGE_ANSWER_SCHEMA);
      } catch (e) {
        problems = [`the answer did not parse: ${firstLine(e)}`];
        continue;
      }
      const checked = checkChangeAnswer(value, kind);
      if (!checked.ok) { problems = checked.problems; continue; }
      if (checked.value.route === "feature") return { ok: true, drafted: { feature: true } };
      const pinned = pinOnlyKnown(checked.value, knownIn(inventory));
      const questions = open(checked);
      const text = renderChange({ code, kind, answer: pinned.answer, origin, facts, open: questions, decisions });
      const ids = pinned.answer.criteria.map((_, i) => criterionId(i));
      const self = sourceSelfCheck(text, "change", { code, ids, open: questions, decisions });
      if (self.length > 0) {
        deps.log.warn(`${STEP}: a checked answer rendered a brief that fails its self-check (a renderer defect): ${self[0]}`);
        problems = self;
        continue;
      }
      return { ok: true, drafted: { feature: false, text, open: questions, unknown: pinned.unknown } };
    }
    return { ok: false, problems };
  };
  const questionsOf = (decisions: readonly Decision[], kept: readonly Question[]) =>
    (c: ReturnType<typeof checkChangeAnswer>): Question[] => (c.ok ? numberQuestions(c.value.questions, decisions, kept) : [...kept]);

  const write = async (text: string): Promise<void> => { await deps.files.write(brief.vfs, text); };
  const decisions0 = existing === null ? [] : parseDecisions(existing);
  const open0 = existing === null ? [] : parseOpenQuestions(existing, decisions0.map((d) => d.id));
  const factsText = facts.join("\n");

  let state: RoundState;
  let verb: string;
  try {
    if (existing !== null && request === "" && ran === null) {
      state = { text: existing, open: open0, decisions: decisions0 };
      verb = "read";
    } else {
      const asked = await ask({
        mode: existing === null ? "draft" : "revision", code, kind, origin: originText, facts: factsText, request,
        current: existing ?? "", decisions: decisions0, fresh: [], inventory: inventoryText,
      }, questionsOf(decisions0, open0), decisions0);
      if (!asked.ok) return [`${STEP}: the brief was refused twice; nothing is written.`, ...problemLines(asked.problems)].join("\n");
      if (asked.drafted.feature) {
        return [`${STEP}: the request is a new promise, not a change of what exists; no brief is written.`, FEATURE_LINE.replace("{code}", code)].join("\n");
      }
      warnings.push(...asked.drafted.unknown.map((n) => `'${n}' is no test the code index shows: its row reads unpinned`));
      state = { text: asked.drafted.text, open: asked.drafted.open, decisions: decisions0 };
      await write(state.text);
      verb = existing === null ? "written" : "revised";
      deps.log.info(`${STEP}: ${brief.shown} ${verb}`);
    }

    // 7. Questions, fold, review - as /dev-spec.
    const fold = async (st: RoundState, fresh: readonly Decision[]): Promise<Folded> => {
      const r = await ask({
        mode: "fold", code, kind, origin: originText, facts: factsText, request: "", current: st.text,
        decisions: st.decisions, fresh, inventory: inventoryText,
      }, questionsOf(st.decisions, st.open), st.decisions);
      if (!r.ok) return { ok: false, problems: r.problems };
      if (r.drafted.feature) return { ok: false, problems: ["the rewrite routed the brief to a spec"] };
      return { ok: true, text: r.drafted.text, open: r.drafted.open };
    };
    const round = { human: deps.human, today, label: `${STEP} ${code}`, headings: HEADINGS, write, fold };
    const first = await questionRound(state, round);
    state = first.state;
    warnings.push(...first.warnings);
    const made = [...first.made];
    let blocked = first.blocked;
    let review: SourceReviewOutcome | null = null;
    if (!blocked) {
      const ids = parsePlanSource(state.text, "change").ids.map((i) => i.id);
      review = await reviewSource(deps.llm, state, {
        mode: "change", whole: "brief", folder: folder.shown, fileShown: brief.shown, origin: originFrom,
        inventory: inventoryText, ids, headings: HEADINGS,
      }, write);
      if (deps.llm.permissionGateEnabled() === false) warnings.push("the host's permission gate is off; the reviewer was offered read tools only");
      if (review.ran && review.added.length > 0) {
        state = review.state;
        const added = new Set(review.added);
        const second = await questionRound(state, round, (q) => added.has(q.id) && q.severity === "Blocking");
        state = second.state;
        warnings.push(...second.warnings);
        made.push(...second.made);
        blocked = second.blocked;
      }
    }

    // 8. The end message.
    const parsed = parsePlanSource(state.text, "change");
    const ids = parsed.ids.map((i) => i.id);
    const unpinned = parsed.mustNotChange.filter((r) => r.pinnedBy === null).length;
    const lines = [
      `${STEP}: ${brief.shown} ${verb} — ${kind}, ${plural(ids.length, "criterion", "criteria")} (${ids.join(", ") || "none"})`,
      ...(ran === null ? [] : [`evidence: \`${ran.command}\` (${ran.seconds} s), output in ${folder.shown}/${reproFileName(code)}`]),
      `must not change: ${plural(parsed.mustNotChange.length, "row", "rows")}, ${unpinned} unpinned`,
      `decisions this run: ${made.length === 0 ? "none" : made.map((d) => `${d.id} → ${d.answer}`).join("; ")}`,
      `open questions: ${openLine(state.open)}`,
      ...(review === null ? [] : [reviewLine(review)]),
      `inventory: ${inventory.entries.length} entries (${inventory.calls} index calls)`,
      ...warningLines(warnings),
    ];
    const blockingLeft = state.open.filter((q) => q.severity === "Blocking");
    if (blocked) {
      lines.push(
        `${STEP}: BLOCKED — a question went unanswered; the open questions are in ${brief.shown} § 8.`,
        `→ Answer them: /dev-change ${code} in an interactive session, or edit the file; nothing was decided for you.`,
      );
    } else if (blockingLeft.length > 0) {
      lines.push(`→ ${blockingLeft.map((q) => q.id).join(", ")} still Blocking: /dev-plan refuses the brief until settled: /dev-change ${code}, or edit the file.`);
    } else {
      lines.push(DEV_CHANGE_NEXT.replace("{code}", code));
    }
    return lines.join("\n");
  } catch (e) {
    return `${STEP}: ${brief.shown} could not be written (${firstLine(e)}); the answers given so far are in the file when it was written before`;
  }
}
