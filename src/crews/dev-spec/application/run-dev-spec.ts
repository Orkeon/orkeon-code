// /dev-spec's use case: checks the inputs and the checkout, finds the code's folder (a change brief there refuses:
// one source per code), inventories the code by the index, asks the model for the spec as JSON (once more on a
// refused answer), renders, self-checks and writes SPEC-<code>.md, then asks the person its open questions one at a
// time through human_input - each answer written to the file before the next question. Unless a question went
// unanswered, the read-only reviewer questions the spec once; its Blocking rows are asked too. One fold then ends
// the run: the model rewrites the body with every decision of the run. With nobody to answer (an unattended run), the questions stay in the file and the run ends BLOCKED:
// nothing is decided on anyone's behalf. On an existing spec it revises: the person's edits and decisions are kept.
import type { CodeIndex, Files, HumanInput, Llm, Logger, Shell } from "../../../shared/application/ports.ts";
import type { ActRoute } from "../../../shared/application/agents/route-agent.ts";
import type { ConfigStore } from "../../../shared/application/config-store.ts";
import { loadDevContext } from "../../../shared/application/dev/load-dev-context.ts";
import { briefInventory, briefInventoryLine, briefPhrases, renderBriefInventory } from "../../../shared/application/dev/brief-inventory.ts";
import { foldDecisions, questionRound } from "../../../shared/application/dev/question-round.ts";
import type { Folded, RoundState } from "../../../shared/application/dev/question-round.ts";
import { reviewLine, reviewSource } from "../../../shared/application/dev/source-review.ts";
import { PhaseTimer } from "../../../shared/application/dev/phase-timer.ts";
import type { SourceReviewOutcome } from "../../../shared/application/dev/source-review.ts";
import {
  codeFolder, dateOf, firstLine, inputCode, inputText, openLine, plural, problemLines, readRequest, sourceSelfCheck,
  SourceWriteFailure, sourceWriter, toplevelRefusal, warningLines,
} from "../../../shared/application/dev/source-step.ts";
import { numberQuestions, parseDecisions, parseOpenQuestions } from "../../../shared/domain/dev/questions.ts";
import type { Decision, Question } from "../../../shared/domain/dev/questions.ts";
import { errorText } from "../../../shared/domain/error-text.ts";
import { parsePlanSource } from "../../../shared/domain/dev/spec-format.ts";
import { SPEC_ANSWER_SCHEMA, checkSpecAnswer, ruleId, useCaseId } from "../domain/spec-answer.ts";
import type { SpecAnswer } from "../domain/spec-answer.ts";
import { renderSpec, specFileName } from "../domain/spec-render.ts";
import { SPEC_DECISIONS_SECTION, SPEC_QUESTIONS_SECTION } from "../domain/markers.ts";
import { noPrecedents, precedentsLine, recallQuery } from "../../../shared/application/dev/step-precedents.ts";
import type { StepPrecedents } from "../../../shared/application/dev/step-precedents.ts";
import { buildSpecPrompt } from "./spec-material.ts";
import type { SpecPromptInput } from "./spec-material.ts";
import { DEV_SPEC_NEXT, answerThem, blockedUnanswered, cannotBeReadNothingWritten, changeBriefExists, specNotWrittenAnswersKept, decisionsThisRun, newSpecNeedsBrief, refusedTwice, rendererDefect, stillBlocking } from "./messages.ts";
import { PERMISSION_GATE_OFF } from "../../../shared/application/dev/messages.ts";
import { answerAskedAgain, answerDidNotParse } from "../../../shared/application/agents/messages.ts";

export interface DevSpecInputs { code?: unknown; request?: unknown }
export interface DevSpecDeps {
  files: Files; shell: Pick<Shell, "run">; config: Pick<ConfigStore, "readValue">; index: CodeIndex;
  llm: Pick<Llm, "extract" | "act" | "permissionGateEnabled">; human: HumanInput; log: Logger; clock: () => Date;
  /** The shared memory's code-triggered recall (T1); absent, nothing is recalled. */
  precedents?: StepPrecedents;
  /** The route of the spec reviewer's act to a cheaper or stronger profile (shared/application/agents/route-agent.ts actRoute);
   *  absent, the act runs on the crew's profile. */
  route?: ActRoute;
}

const STEP = "dev-spec";
const HEADINGS = { questions: SPEC_QUESTIONS_SECTION, decisions: SPEC_DECISIONS_SECTION };

interface Drafted { answer: SpecAnswer; text: string; open: Question[] }

/** One extract, re-asked once with the problems; the text is rendered and read back before it is accepted. Each
 *  extract is timed as a "draft" attempt when `timer` is given (the fold is timed whole by its caller). */
async function askSpec(
  deps: DevSpecDeps, prompt: SpecPromptInput, open: (a: SpecAnswer) => Question[], decisions: readonly Decision[],
  timer: PhaseTimer | null,
): Promise<{ ok: true; drafted: Drafted } | { ok: false; problems: string[] }> {
  let problems: string[] = [];
  for (let attempt = 1; attempt <= 2; attempt++) {
    let value: unknown;
    try {
      const ask = () => deps.llm.extract(buildSpecPrompt(prompt, problems), SPEC_ANSWER_SCHEMA);
      value = await (timer === null ? ask() : timer.time("draft", ask));
    } catch (e) {
      problems = [answerDidNotParse(errorText(e))];
      deps.log.info(answerAskedAgain(STEP, problems));
      continue;
    }
    const checked = checkSpecAnswer(value);
    if (!checked.ok) {
      problems = checked.problems;
      deps.log.info(answerAskedAgain(STEP, problems));
      continue;
    }
    const answer = checked.value;
    const questions = open(answer);
    const text = renderSpec({ code: prompt.code, answer, open: questions, decisions });
    const ids = [...answer.useCases.map((_, i) => useCaseId(i)), ...answer.rules.map((_, i) => ruleId(i))];
    const self = sourceSelfCheck(text, "spec", { code: prompt.code, ids, open: questions, decisions });
    if (self.length > 0) {
      deps.log.warn(rendererDefect(STEP, self[0]));
      problems = self;
      continue;
    }
    return { ok: true, drafted: { answer, text, open: questions } };
  }
  return { ok: false, problems };
}

export async function runDevSpec(input: DevSpecInputs, deps: DevSpecDeps): Promise<string> {
  // 1. Inputs and checkout.
  const code = inputCode(STEP, input.code);
  if (typeof code !== "string") return code.refused;
  const typed = inputText(STEP, "request", input.request);
  if (typeof typed !== "string") return typed.refused;
  const top = await toplevelRefusal(STEP, deps.shell);
  if (top !== null) return top;
  const ctx = await loadDevContext(deps);
  const folder = await codeFolder(STEP, deps.files, ctx.work, code);
  if ("refused" in folder) return folder.refused;

  // 2. One source per code; an existing spec is revised.
  if (folder.names.includes(`CHANGE-${code}.md`)) {
    return changeBriefExists(STEP, folder.shown, code);
  }
  const spec = folder.file(specFileName(code));
  let existing: string | null = null;
  if (folder.names.includes(specFileName(code))) {
    try {
      existing = await deps.files.read(spec.vfs);
    } catch (e) {
      return cannotBeReadNothingWritten(STEP, spec.shown, firstLine(e));
    }
  }
  const request = await readRequest(STEP, deps.files, typed);
  if ("refused" in request) return request.refused;
  if (existing === null && request.text === "") {
    return newSpecNeedsBrief(STEP, code);
  }

  // 3. Inventory by code.
  const timer = new PhaseTimer(deps.clock);
  const shownPhrase = existing === null ? request.text : `${parsePlanSource(existing, "spec").name ?? ""}\n${request.text}`;
  const inventory = await timer.time("inventory", () => briefInventory(deps.index, {
    phrases: briefPhrases(code, shownPhrase),
    excluded: [ctx.work.folder, ...(ctx.pack?.pack.layout.buildOutputs ?? [])],
  }));
  const inventoryText = renderBriefInventory(inventory);
  const warnings = [...ctx.warnings, ...inventory.warnings];
  // T1: the decisions and methods of earlier work on the same topic, before the draft; the same block in every ask.
  const recalled = await (deps.precedents ?? noPrecedents)("T1", recallQuery([code, shownPhrase]));

  const write = sourceWriter(deps.files, spec.vfs);
  const today = dateOf(deps.clock());
  const decisions0 = existing === null ? [] : parseDecisions(existing);
  const open0 = existing === null ? [] : parseOpenQuestions(existing, decisions0.map((d) => d.id));

  // 4. Draft or revision: rendered, read back, written.
  let state: RoundState;
  let verb: string;
  try {
    if (existing !== null && request.text === "") {
      state = { text: existing, open: open0, decisions: decisions0 };
      verb = "read";
    } else {
      const drafted = await askSpec(deps, {
        mode: existing === null ? "draft" : "revision", code, request: request.text, current: existing ?? "",
        decisions: decisions0, fresh: [], inventory: inventoryText, precedents: recalled.block,
      }, (a) => numberQuestions(a.questions, decisions0, open0), decisions0, timer);
      if (!drafted.ok) {
        return [refusedTwice(STEP), ...problemLines(drafted.problems)].join("\n");
      }
      state = { text: drafted.drafted.text, open: drafted.drafted.open, decisions: decisions0 };
      await write(state.text);
      verb = existing === null ? "written" : "revised";
      deps.log.info(`${STEP}: ${spec.shown} ${verb}`);
    }

    // 5. The questions, Blocking first, each answer written before the next one. No rewrite per round: the answers
    // stay in the decisions section, which the reviewer reads, and one fold ends the run (step 7).
    // The person's time is the "questions" phase, the model's fold its own.
    const fold = (st: RoundState, fresh: readonly Decision[]): Promise<Folded> => timer.time("fold", async () => {
      const r = await askSpec(deps, {
        mode: "fold", code, request: "", current: st.text, decisions: st.decisions, fresh, inventory: inventoryText,
        precedents: recalled.block,
      }, (a) => numberQuestions(a.questions, st.decisions, st.open), st.decisions, null);
      return r.ok ? { ok: true, text: r.drafted.text, open: r.drafted.open } : { ok: false, problems: r.problems };
    });
    const round = { human: deps.human, today, label: `${STEP} ${code}`, headings: HEADINGS, write };
    const first = await timer.time("questions", () => questionRound(state, round), "round");
    state = first.state;
    warnings.push(...first.warnings);
    const made = [...first.made];
    let blocked = first.blocked;

    // 6. The review, once, unless a question went unanswered; its Blocking rows are asked.
    let review: SourceReviewOutcome | null = null;
    if (!blocked) {
      const ids = parsePlanSource(state.text, "spec").ids.map((i) => i.id);
      review = await timer.time("review", () => reviewSource(timer.timedExtract(deps.llm, "review extract"), state, {
        mode: "spec", whole: "spec", folder: folder.shown, fileShown: spec.shown, origin: request.from,
        inventory: inventoryText, ids, headings: HEADINGS,
      }, write, deps.route, deps.log));
      if (deps.llm.permissionGateEnabled() === false) warnings.push(PERMISSION_GATE_OFF);
      if (review.ran && review.added.length > 0) {
        state = review.state;
        const added = new Set(review.added);
        const which = (q: Question): boolean => added.has(q.id) && q.severity === "Blocking";
        const second = await timer.time("questions", () => questionRound(state, round, which), "round");
        state = second.state;
        warnings.push(...second.warnings);
        made.push(...second.made);
        blocked = second.blocked;
      }
    }

    // 7. One fold: the body rewritten with every decision of the run.
    const folded = await foldDecisions(state, made, fold, write);
    state = folded.state;
    warnings.push(...folded.warnings);

    // 8. The end message.
    const parsed = parsePlanSource(state.text, "spec");
    const ids = parsed.ids.map((i) => i.id);
    const lines = [
      `${STEP}: ${spec.shown} ${verb} — ${plural(ids.length, "id", "ids")} (${ids.join(", ") || "none"})`,
      decisionsThisRun(made.length === 0 ? "none" : made.map((d) => `${d.id} → ${d.answer}`).join("; ")),
      `open questions: ${openLine(state.open)}`,
      ...(review === null ? [] : [reviewLine(review)]),
      briefInventoryLine(inventory),
      ...[precedentsLine([recalled])].filter((l) => l !== ""),
      ...warningLines(warnings),
    ];
    const blockingLeft = state.open.filter((q) => q.severity === "Blocking");
    if (blocked) {
      lines.push(
        blockedUnanswered(STEP, spec.shown),
        answerThem(code),
      );
    } else if (blockingLeft.length > 0) {
      lines.push(stillBlocking(blockingLeft.map((q) => q.id).join(", "), code));
    } else {
      lines.push(DEV_SPEC_NEXT.replace("{code}", code));
    }
    const timing = timer.line();
    if (timing !== "") {
      deps.log.info(timing);
      lines.push(timing);
    }
    return lines.join("\n");
  } catch (e) {
    if (!(e instanceof SourceWriteFailure)) throw e;
    return specNotWrittenAnswersKept(STEP, spec.shown, e.message);
  }
}
