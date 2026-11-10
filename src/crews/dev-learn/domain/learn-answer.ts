// The learner's answer for one axis: the JSON schema it is extracted into (snake_case
// on the wire), and the check that turns the extraction into a LearnAnswer or the list
// of what is wrong with it, so the crew can ask once more. Pure, no IO.
import type { Checked } from "../../../shared/domain/agents/charter.ts";
import type { CheckKind, MotifStatus, OwnerKind } from "../../../shared/domain/dev/learn-proposals.ts";
import { MAX_TOPIC_CHARS, TOPIC_PATTERN } from "../../../shared/domain/shared-memory/refused.ts";
import { MOTIFS_MUST_BE_LIST, SEEN_LINES_ONLY, addsLines, atProblem, checkIsOneOf, deployedCopy, droppedNeeds, harnessOwnerUnder, lineLength, needsRemovedLine, ownerKindIs, ownerPathNotRelative, removesLines, rowNotGiven, rowTwice, rowsEmpty, sameRows, statusIs, titleLength, tooManyMotifs, topicNotSlug } from "./messages.ts";
import { ANSWER_NOT_AN_OBJECT as NOT_AN_OBJECT, fieldEmpty } from "../../../shared/domain/dev/messages.ts";

export { MAX_TOPIC_CHARS };

export const MAX_MOTIFS_PER_AXIS = 3;
export const MAX_LINES_PER_MOTIF = 5;
export const MAX_LINE_CHARS = 300;
const MAX_TITLE_CHARS = 80;
/** A title longer than this is cut in a label: its first LABEL_TITLE_CHARS characters, then an ellipsis. */
export const LABEL_TITLE_CHARS = 60;
const ADDS_LINES = addsLines(MAX_LINES_PER_MOTIF);
const REMOVES_LINES = removesLines(MAX_LINES_PER_MOTIF);

export interface AnswerMotif {
  title: string; topic: string; rows: string[]; preventiveLine: string;
  owner: { kind: OwnerKind; path: string }; check: CheckKind; status: MotifStatus;
  linesRemoved: string[]; linesAdded: string[]; novelty: string; keyTerm: string;
}
export interface AnswerDropped { title: string; filter: "recurrence" | "prevention" | "novelty"; reason: string }
export interface LearnAnswer { motifs: AnswerMotif[]; dropped: AnswerDropped[] }

const OWNER_KINDS: readonly OwnerKind[] = ["repository", "harness"];
const CHECK_KINDS: readonly CheckKind[] = ["test", "analyzer", "architecture-test", "gate", "rule"];
const STATUSES: readonly MotifStatus[] = ["new", "refines", "replaces", "removes"];
const FILTERS: ReadonlyArray<AnswerDropped["filter"]> = ["recurrence", "prevention", "novelty"];
const HARNESS_PACKS = ".devcontainer/harness/packs/";

const stringList = { type: "array", items: { type: "string" } };

export const LEARN_ANSWER_SCHEMA: object = {
  type: "object",
  properties: {
    motifs: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          topic: { type: "string" },
          rows: stringList,
          preventive_line: { type: "string" },
          owner_kind: { type: "string", enum: [...OWNER_KINDS] },
          owner_path: { type: "string" },
          check: { type: "string", enum: [...CHECK_KINDS] },
          status: { type: "string", enum: [...STATUSES] },
          lines_removed: stringList,
          lines_added: stringList,
          novelty: { type: "string" },
          key_term: { type: "string" },
        },
        required: [
          "title", "topic", "rows", "preventive_line", "owner_kind", "owner_path", "check", "status",
          "lines_added", "novelty", "key_term",
        ],
      },
    },
    dropped: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          filter: { type: "string", enum: [...FILTERS] },
          reason: { type: "string" },
        },
        required: ["title", "filter", "reason"],
      },
    },
  },
  required: ["motifs"],
};

type Obj = Record<string, unknown>;

function isPlainObject(value: unknown): value is Obj {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

const chars = (s: string): number => Array.from(s).length;

/** `motif k "<title>"`, the title cut at 60 characters, a `"` of it written `'`, or `motif k` without a title: the
 *  re-ask never shows the earlier answer, so a problem names the motif by what it was called. */
export function motifLabel(k: number, title: string): string {
  const t = Array.from(title.trim().replace(/"/g, "'"));
  if (t.length === 0) return `motif ${k}`;
  const shown = t.length <= LABEL_TITLE_CHARS ? t.join("") : t.slice(0, LABEL_TITLE_CHARS).join("") + "…";
  return `motif ${k} "${shown}"`;
}

/** An absent list is empty; a list keeps its strings trimmed; anything else is null (wrong shape). */
function lines(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  return value.map(text);
}

function isRelativePath(raw: unknown): boolean {
  if (typeof raw !== "string") return false;
  const p = raw;
  if (p === "" || p !== p.trim()) return false;
  if (p.startsWith("/") || p.includes("\\")) return false;
  return !p.split("/").includes("..");
}

function checkMotif(
  value: unknown, k: number, shownIds: ReadonlySet<string>, ownerLinesShown: boolean, problems: string[],
): AnswerMotif | undefined {
  const item = isPlainObject(value) ? value : {};
  const before = problems.length;
  const title = text(item.title);
  const at = motifLabel(k, title);

  if (title === "" || chars(title) > MAX_TITLE_CHARS) problems.push(titleLength(at));
  const topic = text(item.topic);
  if (!TOPIC_PATTERN.test(topic)) problems.push(topicNotSlug(at, topic, MAX_TOPIC_CHARS));

  const rows = Array.isArray(item.rows) ? item.rows.map(text) : [];
  if (rows.length === 0) problems.push(rowsEmpty(at));
  const seen = new Set<string>();
  for (const id of rows) {
    if (!shownIds.has(id)) problems.push(rowNotGiven(at, id));
    else if (seen.has(id)) problems.push(rowTwice(at, id));
    seen.add(id);
  }

  const preventiveLine = text(item.preventive_line);
  const novelty = text(item.novelty);
  const keyTerm = text(item.key_term);
  for (const [field, v] of [["preventive_line", preventiveLine], ["novelty", novelty], ["key_term", keyTerm]] as const) {
    if (v === "") problems.push(fieldEmpty(at, field));
  }

  const kind = text(item.owner_kind) as OwnerKind;
  const path = typeof item.owner_path === "string" ? item.owner_path : "";
  if (!OWNER_KINDS.includes(kind)) problems.push(ownerKindIs(at));
  if (!isRelativePath(item.owner_path)) {
    problems.push(ownerPathNotRelative(at, path));
  } else if (kind === "repository" && (path === ".claude" || path.startsWith(".claude/"))) {
    problems.push(deployedCopy(at));
  } else if (kind === "harness" && !path.startsWith(HARNESS_PACKS)) {
    problems.push(harnessOwnerUnder(at, HARNESS_PACKS));
  }

  const check = text(item.check) as CheckKind;
  if (!CHECK_KINDS.includes(check)) problems.push(checkIsOneOf(at, CHECK_KINDS.join(", ")));
  const status = text(item.status) as MotifStatus;
  if (!STATUSES.includes(status)) problems.push(statusIs(at));
  else if (status !== "new" && !ownerLinesShown) problems.push(atProblem(at, SEEN_LINES_ONLY(status)));

  const removed = lines(item.lines_removed);
  const added = lines(item.lines_added);
  const linesRule = status === "removes" ? REMOVES_LINES : ADDS_LINES;
  if (added === null || removed === null || removed.length > MAX_LINES_PER_MOTIF) {
    problems.push(`${at}: ${linesRule}`);
  } else if (status === "removes") {
    if (added.length > 0 || removed.filter((l) => l !== "").length === 0) problems.push(`${at}: ${linesRule}`);
  } else if (added.length === 0 || added.length > MAX_LINES_PER_MOTIF) {
    problems.push(`${at}: ${linesRule}`);
  }
  const rawLines = [
    ...(Array.isArray(item.lines_added) ? item.lines_added : []),
    ...(Array.isArray(item.lines_removed) ? item.lines_removed : []),
  ];
  if (rawLines.some((l) => typeof l !== "string" || chars(l.trim()) > MAX_LINE_CHARS || /[\r\n]/.test(l.trim()))) {
    problems.push(lineLength(at));
  }
  if ((status === "refines" || status === "replaces") && (removed ?? []).filter((l) => l !== "").length === 0) {
    problems.push(needsRemovedLine(at, status));
  }

  if (problems.length > before) return undefined;
  return {
    title, topic, rows, preventiveLine, owner: { kind, path }, check, status,
    linesRemoved: removed ?? [], linesAdded: added ?? [], novelty, keyTerm,
  };
}

function checkDropped(value: unknown, problems: string[]): AnswerDropped[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    problems.push(droppedNeeds(1));
    return [];
  }
  const out: AnswerDropped[] = [];
  value.forEach((v, i) => {
    const item = isPlainObject(v) ? v : {};
    const title = text(item.title);
    const filter = text(item.filter) as AnswerDropped["filter"];
    const reason = text(item.reason);
    if (title === "" || reason === "" || !FILTERS.includes(filter)) {
      problems.push(droppedNeeds(i + 1));
      return;
    }
    out.push({ title, filter, reason });
  });
  return out;
}

/** shownIds: the ids handed to the model; an id outside them is a problem. ownerLinesShown: whether the prompt that
 *  gave this answer showed owner lines; without them, a status other than new is a problem. */
export function checkLearnAnswer(
  value: unknown, shownIds: ReadonlySet<string>, ownerLinesShown: boolean,
): Checked<LearnAnswer> {
  if (!isPlainObject(value)) return { ok: false, problems: [NOT_AN_OBJECT] };
  if (!Array.isArray(value.motifs)) return { ok: false, problems: [MOTIFS_MUST_BE_LIST] };
  const problems: string[] = [];
  if (value.motifs.length > MAX_MOTIFS_PER_AXIS) problems.push(tooManyMotifs(value.motifs.length));
  const motifs: AnswerMotif[] = [];
  // A motif's id hashes its axis and its rows: two motifs of one set of rows would share it, and one decision.
  const rowSets = new Map<string, number>();
  value.motifs.forEach((m, i) => {
    const motif = checkMotif(m, i + 1, shownIds, ownerLinesShown, problems);
    if (!motif) return;
    motifs.push(motif);
    const key = [...motif.rows].sort().join(",");
    const first = rowSets.get(key);
    if (first === undefined) rowSets.set(key, i + 1);
    else problems.push(sameRows(motifLabel(i + 1, motif.title), first));
  });
  const dropped = checkDropped(value.dropped, problems);
  return problems.length > 0 ? { ok: false, problems } : { ok: true, value: { motifs, dropped } };
}
