// /dev-learn's use case: checks the inputs and the checkout, reads every verdict file
// of the work folder with both learning states and the refused motifs, then either
// lists the untreated gaps per axis (--list: no model call, no write) or, for each
// axis whose untreated gaps span three batches or more (three axes at most), asks the
// model once - once more on a wrong answer, or with the owner lines its motifs need -
// to group them into motifs, filters the motifs by code, reconciles them with their
// owner file and writes proposals.json and
// PROPOSALS.md under <work>/learn-<date>/. Then, when a person answers, it takes the
// decisions in the same run: one multi-select per axis with motifs, the selected motifs
// accepted and the others refused, as /dev-learn --accept and --refuse would (Orkeon
// Code's state, refused.md). Unanswered, nothing is decided and the end message names
// both commands. It never writes a harness file or an owner file.
import type { Files, HumanInput, Llm, Logger, Shell } from "../../../shared/application/ports.ts";
import type { ConfigStore } from "../../../shared/application/config-store.ts";
import { loadDevContext } from "../../../shared/application/dev/load-dev-context.ts";
import { decideMotifs } from "../../../shared/application/dev/learn-decision.ts";
import { readMemoryDir } from "../../../shared/application/shared-memory/memory-settings.ts";
import { GIT_TOPLEVEL, workFolderLabel } from "../../../shared/application/dev/resolve-work-folder.ts";
import type { WorkFolder } from "../../../shared/application/dev/resolve-work-folder.ts";
import {
  MIN_MOTIF_BATCHES, axisListing, backlogByAxis, canonicalAxis, foldText,
} from "../../../shared/domain/shared-memory/verdict-rows.ts";
import type { AxisBacklog, LearnRow } from "../../../shared/domain/shared-memory/verdict-rows.ts";
import { topicOf } from "../../../shared/domain/shared-memory/refused.ts";
import {
  LEARN_FOLDER_PATTERN, PROPOSALS_JSON, PROPOSALS_MD, deployedHarnessPath, learnFolderName, motifId,
  parseProposalsFile, serializeProposalsFile,
} from "../../../shared/domain/dev/learn-proposals.ts";
import type { AxisProposal, DroppedMotif, Motif, ProposalsFile } from "../../../shared/domain/dev/learn-proposals.ts";
import { sha1Hex } from "../../../shared/domain/sha1.ts";
import { LEARN_ANSWER_SCHEMA, checkLearnAnswer, motifLabel } from "../domain/learn-answer.ts";
import type { AnswerMotif, LearnAnswer } from "../domain/learn-answer.ts";
import { matchOwner, reviewOwner } from "../domain/owner-lines.ts";
import type { OwnerLinesBlock, OwnerReview } from "../domain/owner-lines.ts";
import { renderProposals } from "../domain/proposals-render.ts";
import { MAX_LEARN_PROMPT_CHARS, buildLearnPrompt } from "./learn-prompt-fit.ts";
import type { LearnPromptInput } from "./learn-prompt-fit.ts";
import { readBacklog } from "./learn-backlog.ts";
import type { Backlog } from "./learn-backlog.ts";
import { AXIS_TABLE_HEADER, BAD_INPUT_AXIS, BAD_INPUT_LIST, NOTHING_TO_DECIDE_UNTIL_NEW_GAPS, NOTHING_UNTREATED, LEARN_NOT_IN_WORK_TREE, REFUSED_IN_HARNESS, REFUSE_EACH, REMOVED_LINE_KEPT, axisUnchanged, decideQuestion, learnHead, motifsProposed, noAxisEligible, noMotifKept, noProposalOnAxis, notAtTop, nothingUntreatedOnAxis, proposalsWritten, underThreeBatches } from "./messages.ts";
import { answerDidNotParse } from "../../../shared/application/agents/messages.ts";
import {
  learnBlockedNotWritten as blockedCannotWrite, learnNoWorkFolder as noWorkFolder, learnOutsideMounts as workFolderOutsideMounts,
} from "../../../shared/application/dev/messages.ts";
import { WORKSPACE, workspaceRelative } from "../../../shared/domain/vfs.ts";

export interface DevLearnInputs { axis?: unknown; list?: unknown }
export interface DevLearnDeps {
  files: Files; shell: Pick<Shell, "run">; config: Pick<ConfigStore, "readValue">;
  llm: Pick<Llm, "extract">; log: Logger; clock: () => Date;
  /** Asks the person to decide on the motifs; absent, nothing is decided in the run. */
  human?: Pick<HumanInput, "multi">;
}
export const MAX_AXES_PER_RUN = 3;
export const MAX_ROWS_PER_AXIS = 40;

const MAX_WARNINGS = 5;
const MAX_AXES_NAMED = 5;
const MAX_OWNERS = 12;
const LIST_CAP = 1000;
const TESTS_LIST_CAP = 500;
const OWNER_READ_CHARS = 400_000;
const MAX_OPTION_CHARS = 150;
/** Repository guidance files offered to the model as owners, when the checkout holds them. */
const OWNER_CANDIDATES: readonly string[] = [
  "CONTRIBUTING.md", "AGENTS.md", "CLAUDE.md", "docs/architecture.md", "docs/CONTRIBUTING.md", ".editorconfig",
  ".orkeon/repo.yaml",
];
const KEEP = /^keep:\s*/i;

interface Checked { axis: string | null; list: boolean }

const reasonOf = (error: unknown): string => (error instanceof Error ? error.message : String(error)).split("\n")[0];
const bare = (entry: string): string => entry.replace(/\/+$/, "");
const pad2 = (n: number): string => String(n).padStart(2, "0");
const dateOf = (d: Date): string => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const cut = (text: string, n: number): string => {
  const chars = Array.from(text);
  return chars.length <= n ? text : chars.slice(0, n - 1).join("") + "…";
};

/** A write that fails names its path, so the BLOCKED line can say which. */
class WriteFailure extends Error {
  readonly path: string;
  constructor(path: string, cause: unknown) {
    super(reasonOf(cause));
    this.path = path;
  }
}

function checkInputs(input: DevLearnInputs): Checked | string {
  const { axis, list } = input;
  let checkedAxis: string | null = null;
  if (axis !== undefined && axis !== null) {
    if (typeof axis !== "string" || axis.length < 1 || axis.length > 40 || /[|\r\n]/.test(axis)) {
      return BAD_INPUT_AXIS;
    }
    checkedAxis = axis;
  }
  if (list !== undefined && typeof list !== "boolean") return BAD_INPUT_LIST;
  return { axis: checkedAxis, list: list === true };
}

async function toplevelRefusal(shell: Pick<Shell, "run">): Promise<string | null> {
  let top: string;
  try {
    const r = await shell.run(GIT_TOPLEVEL);
    if (r.exitCode !== 0) return LEARN_NOT_IN_WORK_TREE;
    top = r.stdout.trim();
  } catch {
    return LEARN_NOT_IN_WORK_TREE;
  }
  if (top === "") return LEARN_NOT_IN_WORK_TREE;
  return top === WORKSPACE
    ? null
    : notAtTop(top, WORKSPACE);
}

function warningLines(warnings: readonly string[]): string[] {
  const lines = warnings.slice(0, MAX_WARNINGS).map((w) => `warning: ${w}`);
  if (warnings.length > MAX_WARNINGS) lines.push(`… ${warnings.length - MAX_WARNINGS} more warnings`);
  return lines;
}

function refusedCount(backlog: Backlog): number {
  return backlog.refused.length + backlog.harness.refused.length;
}

function batchesOf(rows: readonly LearnRow[]): string[] {
  return [...new Set(rows.map((r) => r.batch))];
}

function headLine(work: WorkFolder, packShown: string | null, backlog: Backlog): string {
  return learnHead(
    workFolderLabel(work, packShown), backlog.untreated.length, batchesOf(backlog.untreated).length, backlog.files,
    backlog.orkeon.treated.length, backlog.harness.treated.length, refusedCount(backlog),
  );
}

// ---- --list ----

function axisTableLine(a: AxisBacklog): string {
  const name = Array.from(a.axis).slice(0, 16).join("").padEnd(16);
  return `${name} ${String(a.rows.length).padStart(4)} ${String(a.batches.length).padStart(7)} ${String(a.blocking).padStart(8)}`;
}

function listLines(backlog: Backlog, axes: readonly AxisBacklog[], axis: string | null): string[] {
  if (axis !== null) {
    const rows = axes.flatMap((a) => a.rows);
    return rows.length === 0 ? [nothingUntreatedOnAxis(axis)] : axisListing(rows);
  }
  const out = axes.length === 0
    ? [NOTHING_UNTREATED]
    : ["", AXIS_TABLE_HEADER, ...axes.map(axisTableLine)];
  const refused = [
    ...backlog.refused.map((m) => `- ${m.topic} — ${m.motif}`),
    ...backlog.harness.refused.map((t) => `- ${t} (harness)`),
  ];
  if (refused.length > 0) out.push("", "refused motifs:", ...refused);
  return out;
}

// ---- the material ----

/** The repository's guidance files that exist, then the architecture tests of the pack's tests folder (12 at most). */
async function ownerFiles(files: Pick<Files, "list">, testsFolder: string | undefined): Promise<string[]> {
  const listings = new Map<string, string[]>();
  const listing = async (dir: string, cap: number): Promise<string[]> => {
    const known = listings.get(dir);
    if (known) return known;
    let entries: string[];
    try {
      entries = (await files.list(dir, cap)).map(bare);
    } catch {
      entries = [];
    }
    listings.set(dir, entries);
    return entries;
  };
  const out: string[] = [];
  for (const path of OWNER_CANDIDATES) {
    const slash = path.lastIndexOf("/");
    const dir = slash < 0 ? WORKSPACE : `${WORKSPACE}/${path.slice(0, slash)}`;
    if ((await listing(dir, LIST_CAP)).includes(path.slice(slash + 1))) out.push(path);
  }
  const tests = testsFolder?.trim().replace(/^\.\//, "").replace(/\/+$/, "");
  if (tests && !tests.startsWith("/") && !tests.split("/").includes("..")) {
    const names = (await listing(`${WORKSPACE}/${tests}`, TESTS_LIST_CAP)).filter((n) => n.includes("architecture")).sort();
    out.push(...names.map((n) => `${tests}/${n}`));
  }
  return out.slice(0, MAX_OWNERS);
}

/** Each refused motif under the slug code matches it by: its topic, or for a harness refusal the slug of its text
 *  (topicOf); a line the harness keeps is listed as it is. */
function refusedForPrompt(backlog: Backlog): string[] {
  return [...new Set([
    ...backlog.refused.map((m) => `${m.topic} — ${m.motif}`),
    ...backlog.harness.refused.map((t) => (KEEP.test(t) ? t : `${topicOf(t)} — ${t}`)),
  ])];
}

/** The rows shown (40 at most, then fewer until the prompt fits its budget) and how many are hidden. */
function shownRows(entry: AxisBacklog, base: Omit<LearnPromptInput, "rows">): { shown: LearnRow[]; hidden: number } {
  const shown = entry.rows.slice(0, MAX_ROWS_PER_AXIS);
  while (shown.length > 0 && buildLearnPrompt({ ...base, rows: shown }, []).length > MAX_LEARN_PROMPT_CHARS) shown.pop();
  return { shown, hidden: entry.rows.length - shown.length };
}

// ---- the earlier run ----

async function earlierProposals(files: Files, work: WorkFolder, today: string): Promise<ProposalsFile | null> {
  if (work.vfsPath === null) return null;
  let entries: string[];
  try {
    entries = (await files.list(work.vfsPath, LIST_CAP)).map(bare);
  } catch {
    return null;
  }
  const folders = entries.filter((e) => LEARN_FOLDER_PATTERN.test(e) && e < today).sort().reverse();
  for (const folder of folders) {
    let text: string;
    try {
      text = await files.read(`${work.vfsPath}/${folder}/${PROPOSALS_JSON}`);
    } catch {
      continue;
    }
    const parsed = parseProposalsFile(text);
    if (parsed.ok) return { ...parsed.file, date: folder };
  }
  return null;
}

/** The earlier folder when the axis was asked there on the same rows and kept no motif; else null. */
function unchangedSince(previous: ProposalsFile | null, axis: string, shown: readonly string[]): string | null {
  if (previous === null) return null;
  const before = previous.axes.find((a) => a.axis === axis);
  if (!before || (before.outcome !== "no-motif" && before.outcome !== "unchanged")) return null;
  const same = before.shownRows.length === shown.length && [...before.shownRows].sort().join(",") === [...shown].sort().join(",");
  if (!same) return null;
  return before.outcome === "unchanged" && before.reason ? before.reason : previous.date;
}

// ---- the model call ----

/** What the owner files say against a checked answer: the problems of a re-ask and the owner lines shown with them. */
interface OwnerFindings { problems: string[]; blocks: OwnerLinesBlock[] }

/** Two attempts. A first answer refused on shape spends the second on its problems, as before; when its only fault
 *  is a status other than new, given before any owner line was shown, the second attempt also shows the owner
 *  lines of its motifs. A first answer that passes is reviewed against its owners; when they raise problems, the
 *  second attempt shows them with the owner lines, and a second answer that fails its check leaves the first one
 *  standing. */
async function ask(
  llm: Pick<Llm, "extract">, input: LearnPromptInput, shownIds: ReadonlySet<string>,
  review: (answer: LearnAnswer) => Promise<OwnerFindings>,
): Promise<{ ok: true; answer: LearnAnswer } | { ok: false; problem: string }> {
  let problems: string[] = [];
  let blocks: OwnerLinesBlock[] = [];
  let first: LearnAnswer | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    let value: unknown;
    try {
      value = await llm.extract(buildLearnPrompt(input, problems, blocks), LEARN_ANSWER_SCHEMA);
    } catch (error) {
      if (first !== null) return { ok: true, answer: first };
      problems = [answerDidNotParse(reasonOf(error))];
      continue;
    }
    const checked = checkLearnAnswer(value, shownIds, blocks.some((b) => b.lines.length > 0));
    if (!checked.ok) {
      if (first !== null) return { ok: true, answer: first };
      problems = checked.problems;
      const seen = attempt === 0 ? checkLearnAnswer(value, shownIds, true) : null;
      if (seen?.ok) {
        const findings = await review(seen.value);
        problems = [...problems, ...findings.problems];
        blocks = findings.blocks;
      }
      continue;
    }
    if (attempt > 0) return { ok: true, answer: checked.value };
    const findings = await review(checked.value);
    if (findings.problems.length === 0) return { ok: true, answer: checked.value };
    first = checked.value;
    problems = findings.problems;
    blocks = findings.blocks;
  }
  return first !== null ? { ok: true, answer: first } : { ok: false, problem: problems[0] ?? "no answer" };
}

// ---- the code filters ----

/** k: the motif's place in the answer, from 1, as the problems number it. */
interface Kept { motif: AnswerMotif; batches: string[]; k: number }

function filterMotifs(
  answer: LearnAnswer, rowsById: ReadonlyMap<string, LearnRow>, backlog: Backlog,
): { kept: Kept[]; dropped: DroppedMotif[] } {
  const dropped: DroppedMotif[] = [];
  const harnessTexts = backlog.harness.refused.filter((t) => !KEEP.test(t));
  const keptLines = backlog.harness.refused.filter((t) => KEEP.test(t)).map((t) => foldText(t.replace(KEEP, "").trim()));
  const kept: Kept[] = [];
  for (let i = 0; i < answer.motifs.length; i++) {
    const motif = answer.motifs[i];
    const batches = batchesOf(motif.rows.map((id) => rowsById.get(id)).filter((r): r is LearnRow => r !== undefined));
    if (batches.length < MIN_MOTIF_BATCHES) {
      dropped.push({ title: motif.title, filter: "recurrence", reason: `${batches.length} batches (${batches.join(", ")})` });
      continue;
    }
    const refused = backlog.refused.find((r) => r.topic === motif.topic);
    if (refused) {
      dropped.push({ title: motif.title, filter: "novelty", reason: `refused on ${refused.date} (${backlog.refusedFile})` });
      continue;
    }
    if (harnessTexts.some((t) => foldText(t.trim()) === foldText(motif.title) || topicOf(t) === motif.topic)) {
      dropped.push({ title: motif.title, filter: "novelty", reason: REFUSED_IN_HARNESS });
      continue;
    }
    const linesRemoved = motif.linesRemoved.filter((l) => !keptLines.includes(foldText(l.trim())));
    if (motif.status !== "new" && linesRemoved.length === 0) {
      dropped.push({ title: motif.title, filter: "novelty", reason: REMOVED_LINE_KEPT });
      continue;
    }
    kept.push({ motif: { ...motif, linesRemoved }, batches, k: i + 1 });
  }
  return { kept, dropped: [...dropped, ...answer.dropped] };
}

// ---- reconcile ----

/** Reads a motif's owner file in the checkout (a harness owner through its deployed copy), each path once a run;
 *  path: the file read. */
function ownerReader(files: Pick<Files, "read">): (motif: AnswerMotif) => Promise<{ path: string; text: string | null }> {
  const texts = new Map<string, string | null>();
  return async (motif) => {
    const path = motif.owner.kind === "harness" ? deployedHarnessPath(motif.owner.path) : motif.owner.path;
    if (path === null) return { path: motif.owner.path, text: null };
    if (!texts.has(path)) {
      let text: string | null;
      try {
        text = await files.read(`${WORKSPACE}/${path}`, OWNER_READ_CHARS);
      } catch {
        text = null;
      }
      texts.set(path, text);
    }
    return { path, text: texts.get(path) ?? null };
  };
}

type OwnerRead = ReturnType<typeof ownerReader>;

/** A kept motif against its owner: an absent owner (the file read) is only said in the summary; what the owner
 *  holds is named under the owner's own path, a harness owner's in the orkeon-workshop repository. */
async function reconcile(read: OwnerRead, { motif, k }: Kept): Promise<OwnerReview> {
  const { path, text } = await read(motif);
  if (text === null) return { summary: `owner absent: ${path}`, problems: [], block: null };
  return reviewOwner(motifLabel(k, motif.title), motif, motif.owner.path, matchOwner(text, motif.keyTerm, motif.linesRemoved));
}

async function ownerFindings(read: OwnerRead, kept: readonly Kept[]): Promise<OwnerFindings> {
  const findings: OwnerFindings = { problems: [], blocks: [] };
  for (const one of kept) {
    const review = await reconcile(read, one);
    findings.problems.push(...review.problems);
    if (review.block !== null) findings.blocks.push(review.block);
  }
  return findings;
}

/** 8 hex digits per motif; 10 for every motif whose 8 collide with another's in the file (L3-Q09). */
function settleIds(axes: AxisProposal[]): void {
  const count = new Map<string, number>();
  for (const m of axes.flatMap((a) => a.motifs)) count.set(m.id, (count.get(m.id) ?? 0) + 1);
  for (const a of axes) {
    for (const m of a.motifs) {
      if ((count.get(m.id) ?? 0) > 1) m.id = sha1Hex(`${a.axis}|${[...m.rows].sort().join(",")}`).slice(0, 10);
    }
  }
}

function axisOutcomeLine(a: AxisProposal): string {
  if (a.outcome === "unchanged") return axisUnchanged(a.axis, a.reason);
  const head = `axis ${a.axis} — ${a.batches} batches: `;
  if (a.outcome === "proposed") {
    return motifsProposed(head, a.motifs.length, a.motifs.map((m) => m.id).join(", "), a.dropped.length);
  }
  if (a.outcome === "no-motif") return noMotifKept(head, a.dropped.length);
  return `${head}no proposal (${a.reason ?? "no answer"})`;
}

/** One line per motif: `<id> — <title> (<n> batches, <status>, <owner>)`. */
function motifOption(m: Motif): string {
  return cut(`${m.id} — ${m.title.replace(/\s+/g, " ")} (${m.batches.length} batches, ${m.status}, ${m.owner.path})`, MAX_OPTION_CHARS);
}

interface Decided { accept: string[]; refuse: string[]; ids: Set<string> }

/** One multi-select per axis with motifs: the selected ones accepted and the others refused. The human_input
 *  adapter offers "Decide later" first and reads it, or an empty selection, as no answer (an unattended provider
 *  must refuse nothing on the person's behalf): an axis left so decides nothing. */
async function askDecisions(
  human: Pick<HumanInput, "multi"> | undefined, proposals: readonly AxisProposal[], shown: string,
): Promise<Decided> {
  const decided: Decided = { accept: [], refuse: [], ids: new Set() };
  if (human === undefined) return decided;
  for (const axis of proposals) {
    if (axis.motifs.length === 0) continue;
    const byOption = new Map(axis.motifs.map((m) => [motifOption(m), m.id]));
    const answer = await human.multi(
      decideQuestion(axis.axis, shown),
      [...byOption.keys()],
    );
    if (!answer.answered) continue;
    const picked = new Set(answer.values.map((v) => byOption.get(v)).filter((id): id is string => id !== undefined));
    if (picked.size === 0) continue;
    for (const m of axis.motifs) {
      (picked.has(m.id) ? decided.accept : decided.refuse).push(m.id);
      decided.ids.add(m.id);
    }
  }
  return decided;
}

export async function runDevLearn(input: DevLearnInputs, deps: DevLearnDeps): Promise<string> {
  const args = checkInputs(input);
  if (typeof args === "string") return args;
  const top = await toplevelRefusal(deps.shell);
  if (top !== null) return top;

  const ctx = await loadDevContext(deps);
  const work = ctx.work;
  if (work.vfsPath === null) {
    return [...warningLines(ctx.warnings),
      workFolderOutsideMounts(work.folder),
    ].join("\n");
  }
  if (!work.exists) {
    return [...warningLines(ctx.warnings), noWorkFolder(work.folder)].join("\n");
  }

  // refused.md under memory.dir, as /memory-admit and memory_push read it; a value set aside is said.
  const memoryDir = await readMemoryDir(deps.config);
  const backlog = await readBacklog(deps.files, work, `${memoryDir.dir}/refused.md`);
  const memoryWarnings = memoryDir.warning === undefined ? [] : [memoryDir.warning];
  const out = [...warningLines([...ctx.warnings, ...memoryWarnings, ...backlog.warnings]), headLine(work, ctx.pack?.shown ?? null, backlog)];
  const done = (...lines: string[]): string => [...out, ...lines].join("\n");

  const wanted = args.axis === null ? null : canonicalAxis(args.axis);
  const axes = backlogByAxis(backlog.untreated).filter((a) => wanted === null || a.axis === wanted);
  if (args.list) return done(...listLines(backlog, axes, args.axis));

  const eligible = axes.filter((a) => a.batches.length >= MIN_MOTIF_BATCHES);
  if (args.axis !== null && eligible.length === 0) {
    const b = axes[0]?.batches.length ?? 0;
    return done(underThreeBatches(`${axes[0]?.axis ?? wanted}`, b));
  }
  if (eligible.length === 0) {
    const named = axes.slice(0, MAX_AXES_NAMED).map((a) => `${a.axis} ${a.batches.length}`).join(", ");
    return done(noAxisEligible(named === "" ? "none" : named));
  }

  const handled = eligible.slice(0, MAX_AXES_PER_RUN);
  const left = eligible.slice(MAX_AXES_PER_RUN);
  const date = dateOf(deps.clock());
  const folder = learnFolderName(date);
  const previous = await earlierProposals(deps.files, work, folder);
  const owners = await ownerFiles(deps.files, ctx.pack?.pack.layout.tests);
  const refused = refusedForPrompt(backlog);
  const readOwner = ownerReader(deps.files);

  const proposals: AxisProposal[] = [];
  for (const entry of handled) {
    const base = { axis: entry.axis, refused, owners };
    const { shown, hidden } = shownRows(entry, base);
    const proposal: AxisProposal = {
      axis: entry.axis, batches: entry.batches.length, gaps: entry.rows.length,
      shownRows: shown.map((r) => r.id), hiddenRows: hidden, outcome: "no-motif", motifs: [], dropped: [],
    };
    proposals.push(proposal);
    const since = unchangedSince(previous, entry.axis, proposal.shownRows);
    if (since !== null) {
      proposal.outcome = "unchanged";
      proposal.reason = since;
      continue;
    }
    const rowsById = new Map(shown.map((r) => [r.id, r]));
    const asked = await ask(deps.llm, { ...base, rows: shown }, new Set(proposal.shownRows),
      (answer) => ownerFindings(readOwner, filterMotifs(answer, rowsById, backlog).kept));
    if (!asked.ok) {
      proposal.outcome = "no-proposal";
      proposal.reason = asked.problem;
      deps.log.warn(noProposalOnAxis(entry.axis, asked.problem));
      continue;
    }
    const { kept, dropped } = filterMotifs(asked.answer, rowsById, backlog);
    proposal.dropped = dropped;
    for (const one of kept) {
      const { motif, batches } = one;
      const m: Motif = {
        id: motifId(entry.axis, motif.rows), title: motif.title, topic: motif.topic, rows: motif.rows, batches,
        preventiveLine: motif.preventiveLine, owner: motif.owner, check: motif.check, status: motif.status,
        linesRemoved: motif.linesRemoved, linesAdded: motif.linesAdded, novelty: motif.novelty, keyTerm: motif.keyTerm,
        reconcile: (await reconcile(readOwner, one)).summary,
      };
      proposal.motifs.push(m);
    }
    if (proposal.motifs.length > 0) proposal.outcome = "proposed";
  }
  settleIds(proposals);

  const file: ProposalsFile = {
    version: 1, date, work: work.folder,
    read: {
      files: backlog.files, gaps: backlog.untreated.length, batches: batchesOf(backlog.untreated).length,
      treatedOrkeon: backlog.orkeon.treated.length, treatedHarness: backlog.harness.treated.length,
      refused: refusedCount(backlog),
    },
    axes: proposals,
  };
  const dir = `${work.vfsPath}/${folder}`;
  try {
    for (const [name, content] of [[PROPOSALS_JSON, serializeProposalsFile(file)], [PROPOSALS_MD, renderProposals(file)]]) {
      const path = `${dir}/${name}`;
      try {
        await deps.files.write(path, content);
      } catch (error) {
        throw new WriteFailure(path, error);
      }
    }
  } catch (error) {
    if (!(error instanceof WriteFailure)) throw error;
    const shown = workspaceRelative(error.path);
    return done(blockedCannotWrite(shown, error.message));
  }
  deps.log.info(proposalsWritten(`${work.folder}/${folder}`));

  const lines = proposals.map(axisOutcomeLine);
  if (left.length > 0) lines.push(`next run: ${left.map((a) => a.axis).join(", ")}`);
  lines.push(`written: ${work.folder}/${folder}/${PROPOSALS_MD}`);
  const decided = await askDecisions(deps.human, proposals, `${work.folder}/${folder}/${PROPOSALS_MD}`);
  if (decided.accept.length + decided.refuse.length > 0) {
    const lookup = { files: [{ folder, file }], warnings: [] };
    lines.push(...await decideMotifs(decided.accept, decided.refuse, lookup, work, deps));
  }
  const ids = proposals.flatMap((a) => a.motifs.map((m) => m.id)).filter((id) => !decided.ids.has(id));
  if (ids.length > 0) {
    lines.push(
      `→ /dev-learn --accept ${ids.join(",")}`,
      REFUSE_EACH,
    );
  } else if (decided.ids.size === 0) {
    lines.push(NOTHING_TO_DECIDE_UNTIL_NEW_GAPS);
  }
  return done(...lines);
}
