// /dev-spec's use case: checks the inputs and the checkout, finds the code's folder (a change brief there refuses:
// one source per code), inventories the code by the index, asks the model for the spec as JSON (once more on a
// refused answer), renders, self-checks and writes SPEC-<code>.md, then asks the person its open questions one at a
// time through human_input - each answer written to the file before the next question - and folds the answers into
// the body. Unless a question went unanswered, the read-only reviewer questions the spec once; its Blocking rows are
// asked too. With nobody to answer (an unattended run), the questions stay in the file and the run ends BLOCKED:
// nothing is decided on anyone's behalf. On an existing spec it revises: the person's edits and decisions are kept.
import type { CodeIndex, Files, HumanInput, Llm, Logger, Shell } from "../../../shared/application/ports.ts";
import type { ConfigStore } from "../../../shared/application/config-store.ts";
import { loadDevContext } from "../../../shared/application/dev/load-dev-context.ts";
import { briefInventory, briefPhrases, renderBriefInventory } from "../../../shared/application/dev/brief-inventory.ts";
import { questionRound } from "../../../shared/application/dev/question-round.ts";
import type { Folded, RoundState } from "../../../shared/application/dev/question-round.ts";
import { reviewLine, reviewSource } from "../../../shared/application/dev/source-review.ts";
import type { SourceReviewOutcome } from "../../../shared/application/dev/source-review.ts";
import {
  codeFolder, dateOf, firstLine, inputCode, inputText, openLine, plural, problemLines, readRequest, sourceSelfCheck,
  toplevelRefusal, warningLines,
} from "../../../shared/application/dev/source-step.ts";
import { numberQuestions, parseDecisions, parseOpenQuestions } from "../../../shared/domain/dev/questions.ts";
import type { Decision, Question } from "../../../shared/domain/dev/questions.ts";
import { parsePlanSource } from "../../../shared/domain/dev/spec-format.ts";
import { SPEC_ANSWER_SCHEMA, checkSpecAnswer, ruleId, useCaseId } from "../domain/spec-answer.ts";
import type { SpecAnswer } from "../domain/spec-answer.ts";
import { SPEC_DECISIONS_SECTION, SPEC_QUESTIONS_SECTION, renderSpec, specFileName } from "../domain/spec-render.ts";
import { buildSpecPrompt } from "./spec-prompt.ts";
import type { SpecPromptInput } from "./spec-prompt.ts";

export interface DevSpecInputs { code?: unknown; request?: unknown }
export interface DevSpecDeps {
  files: Files; shell: Pick<Shell, "run">; config: Pick<ConfigStore, "readValue">; index: CodeIndex;
  llm: Pick<Llm, "extract" | "act" | "permissionGateEnabled">; human: HumanInput; log: Logger; clock: () => Date;
}

const STEP = "dev-spec";
const HEADINGS = { questions: SPEC_QUESTIONS_SECTION, decisions: SPEC_DECISIONS_SECTION };
export const DEV_SPEC_NEXT = "→ Next step, once you have validated the spec: /dev-plan {code}";

interface Drafted { answer: SpecAnswer; text: string; open: Question[] }

/** One extract, re-asked once with the problems; the text is rendered and read back before it is accepted. */
async function askSpec(
  deps: DevSpecDeps, prompt: SpecPromptInput, open: (a: SpecAnswer) => Question[], decisions: readonly Decision[],
): Promise<{ ok: true; drafted: Drafted } | { ok: false; problems: string[] }> {
  let problems: string[] = [];
  for (let attempt = 1; attempt <= 2; attempt++) {
    let value: unknown;
    try {
      value = await deps.llm.extract(buildSpecPrompt(prompt, problems), SPEC_ANSWER_SCHEMA);
    } catch (e) {
      problems = [`the answer did not parse: ${firstLine(e)}`];
      continue;
    }
    const checked = checkSpecAnswer(value);
    if (!checked.ok) { problems = checked.problems; continue; }
    const answer = checked.value;
    const questions = open(answer);
    const text = renderSpec({ code: prompt.code, answer, open: questions, decisions });
    const ids = [...answer.useCases.map((_, i) => useCaseId(i)), ...answer.rules.map((_, i) => ruleId(i))];
    const self = sourceSelfCheck(text, "spec", { code: prompt.code, ids, open: questions, decisions });
    if (self.length > 0) {
      deps.log.warn(`${STEP}: a checked answer rendered a spec that fails its self-check (a renderer defect): ${self[0]}`);
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
    return `${STEP}: ${folder.shown}/CHANGE-${code}.md exists: a code has one source; revise it with /dev-change ${code}, or pick another code`;
  }
  const spec = folder.file(specFileName(code));
  let existing: string | null = null;
  if (folder.names.includes(specFileName(code))) {
    try {
      existing = await deps.files.read(spec.vfs);
    } catch (e) {
      return `${STEP}: ${spec.shown} cannot be read (${firstLine(e)}); nothing is written`;
    }
  }
  const request = await readRequest(STEP, deps.files, typed);
  if ("refused" in request) return request.refused;
  if (existing === null && request.text === "") {
    return `${STEP}: a new spec needs its brief: /dev-spec ${code} <what the feature does, for whom, why> (or a path to a .md file)`;
  }

  // 3. Inventory by code.
  const shownPhrase = existing === null ? request.text : `${parsePlanSource(existing, "spec").name ?? ""}\n${request.text}`;
  const inventory = await briefInventory(deps.index, {
    phrases: briefPhrases(code, shownPhrase),
    excluded: [ctx.work.folder, ...(ctx.pack?.pack.layout.buildOutputs ?? [])],
  });
  const inventoryText = renderBriefInventory(inventory);
  const warnings = [...ctx.warnings, ...inventory.warnings];

  const write = async (text: string): Promise<void> => { await deps.files.write(spec.vfs, text); };
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
        decisions: decisions0, fresh: [], inventory: inventoryText,
      }, (a) => numberQuestions(a.questions, decisions0, open0), decisions0);
      if (!drafted.ok) {
        return [`${STEP}: the spec was refused twice; nothing is written.`, ...problemLines(drafted.problems)].join("\n");
      }
      state = { text: drafted.drafted.text, open: drafted.drafted.open, decisions: decisions0 };
      await write(state.text);
      verb = existing === null ? "written" : "revised";
      deps.log.info(`${STEP}: ${spec.shown} ${verb}`);
    }

    // 5. The questions, Blocking first, each answer written before the next one; then one fold.
    const fold = async (st: RoundState, fresh: readonly Decision[]): Promise<Folded> => {
      const r = await askSpec(deps, {
        mode: "fold", code, request: "", current: st.text, decisions: st.decisions, fresh, inventory: inventoryText,
      }, (a) => numberQuestions(a.questions, st.decisions, st.open), st.decisions);
      return r.ok ? { ok: true, text: r.drafted.text, open: r.drafted.open } : { ok: false, problems: r.problems };
    };
    const round = { human: deps.human, today, label: `${STEP} ${code}`, headings: HEADINGS, write, fold };
    const first = await questionRound(state, round);
    state = first.state;
    warnings.push(...first.warnings);
    const made = [...first.made];
    let blocked = first.blocked;

    // 6. The review, once, unless a question went unanswered; its Blocking rows are asked.
    let review: SourceReviewOutcome | null = null;
    if (!blocked) {
      const ids = parsePlanSource(state.text, "spec").ids.map((i) => i.id);
      review = await reviewSource(deps.llm, state, {
        mode: "spec", whole: "spec", folder: folder.shown, fileShown: spec.shown, origin: request.from,
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

    // 7. The end message.
    const parsed = parsePlanSource(state.text, "spec");
    const ids = parsed.ids.map((i) => i.id);
    const lines = [
      `${STEP}: ${spec.shown} ${verb} — ${plural(ids.length, "id", "ids")} (${ids.join(", ") || "none"})`,
      `decisions this run: ${made.length === 0 ? "none" : made.map((d) => `${d.id} → ${d.answer}`).join("; ")}`,
      `open questions: ${openLine(state.open)}`,
      ...(review === null ? [] : [reviewLine(review)]),
      `inventory: ${inventory.entries.length} entries (${inventory.calls} index calls)`,
      ...warningLines(warnings),
    ];
    const blockingLeft = state.open.filter((q) => q.severity === "Blocking");
    if (blocked) {
      lines.push(
        `${STEP}: BLOCKED — a question went unanswered; the open questions are in ${spec.shown} § 12.`,
        `→ Answer them: /dev-spec ${code} in an interactive session, or edit the file; nothing was decided for you.`,
      );
    } else if (blockingLeft.length > 0) {
      lines.push(`→ ${blockingLeft.map((q) => q.id).join(", ")} still Blocking: /dev-plan refuses the spec until settled: /dev-spec ${code}, or edit the file.`);
    } else {
      lines.push(DEV_SPEC_NEXT.replace("{code}", code));
    }
    return lines.join("\n");
  } catch (e) {
    return `${STEP}: ${spec.shown} could not be written (${firstLine(e)}); the answers given so far are in the file when it was written before`;
  }
}
