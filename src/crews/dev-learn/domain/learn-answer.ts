// The learner's answer for one axis: the JSON schema it is extracted into (snake_case
// on the wire), and the check that turns the extraction into a LearnAnswer or the list
// of what is wrong with it, so the crew can ask once more. Pure, no IO.
import type { Checked } from "../../../shared/domain/agents/charter.ts";
import type { CheckKind, MotifStatus, OwnerKind } from "../../../shared/domain/dev/learn-proposals.ts";
import { TOPIC_PATTERN } from "../../../shared/domain/shared-memory/refused.ts";

export const MAX_MOTIFS_PER_AXIS = 3;
export const MAX_LINES_PER_MOTIF = 5;
export const MAX_LINE_CHARS = 300;
const MAX_TITLE_CHARS = 80;

export interface AnswerMotif {
  title: string; topic: string; rows: string[]; preventiveLine: string;
  owner: { kind: OwnerKind; path: string }; check: CheckKind; status: MotifStatus;
  linesRemoved: string[]; linesAdded: string[]; novelty: string; keyTerm: string;
}
export interface AnswerDropped { title: string; filter: "recurrence" | "prevention" | "novelty"; reason: string }
export interface LearnAnswer { motifs: AnswerMotif[]; dropped: AnswerDropped[] }

const OWNER_KINDS: readonly OwnerKind[] = ["repository", "harness"];
const CHECK_KINDS: readonly CheckKind[] = ["test", "analyzer", "architecture-test", "gate", "rule"];
const STATUSES: readonly MotifStatus[] = ["new", "refines", "replaces"];
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

function checkMotif(value: unknown, k: number, shownIds: ReadonlySet<string>, problems: string[]): AnswerMotif | undefined {
  const item = isPlainObject(value) ? value : {};
  const before = problems.length;
  const at = `motif ${k}`;

  const title = text(item.title);
  if (title === "" || chars(title) > MAX_TITLE_CHARS) problems.push(`${at}: title must be 1 to 80 characters`);
  const topic = text(item.topic);
  if (!TOPIC_PATTERN.test(topic)) problems.push(`${at}: topic '${topic}' is not a kebab slug of at most 60 characters`);

  const rows = Array.isArray(item.rows) ? item.rows.map(text) : [];
  if (rows.length === 0) problems.push(`${at}: rows is empty`);
  const seen = new Set<string>();
  for (const id of rows) {
    if (!shownIds.has(id)) problems.push(`${at}: row '${id}' is not one of the rows given`);
    else if (seen.has(id)) problems.push(`${at}: row '${id}' is listed twice`);
    seen.add(id);
  }

  const preventiveLine = text(item.preventive_line);
  const novelty = text(item.novelty);
  const keyTerm = text(item.key_term);
  for (const [field, v] of [["preventive_line", preventiveLine], ["novelty", novelty], ["key_term", keyTerm]] as const) {
    if (v === "") problems.push(`${at}: ${field} is empty`);
  }

  const kind = text(item.owner_kind) as OwnerKind;
  const path = typeof item.owner_path === "string" ? item.owner_path : "";
  if (!OWNER_KINDS.includes(kind)) problems.push(`${at}: owner_kind must be repository or harness`);
  if (!isRelativePath(item.owner_path)) {
    problems.push(`${at}: owner_path '${path}' is not a relative path`);
  } else if (kind === "repository" && (path === ".claude" || path.startsWith(".claude/"))) {
    problems.push(`${at}: .claude/ is the harness's deployed copy: name the orkeon-workshop file with owner_kind harness`);
  } else if (kind === "harness" && !path.startsWith(HARNESS_PACKS)) {
    problems.push(`${at}: a harness owner is a file of the orkeon-workshop repository under ${HARNESS_PACKS}`);
  }

  const check = text(item.check) as CheckKind;
  if (!CHECK_KINDS.includes(check)) problems.push(`${at}: check must be one of ${CHECK_KINDS.join(", ")}`);
  const status = text(item.status) as MotifStatus;
  if (!STATUSES.includes(status)) problems.push(`${at}: status must be new, refines or replaces`);

  const removed = lines(item.lines_removed);
  const added = lines(item.lines_added);
  if (added === null || removed === null || added.length === 0 || added.length > MAX_LINES_PER_MOTIF ||
    removed.length > MAX_LINES_PER_MOTIF) {
    problems.push(`${at}: 1 to 5 lines added and at most 5 removed`);
  }
  const rawLines = [
    ...(Array.isArray(item.lines_added) ? item.lines_added : []),
    ...(Array.isArray(item.lines_removed) ? item.lines_removed : []),
  ];
  if (rawLines.some((l) => typeof l !== "string" || chars(l.trim()) > MAX_LINE_CHARS || /[\r\n]/.test(l.trim()))) {
    problems.push(`${at}: each line is one line of at most 300 characters`);
  }
  if ((status === "refines" || status === "replaces") && (removed ?? []).filter((l) => l !== "").length === 0) {
    problems.push(`${at}: ${status} needs the line it removes`);
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
    problems.push("dropped 1: title, filter and reason are needed");
    return [];
  }
  const out: AnswerDropped[] = [];
  value.forEach((v, i) => {
    const item = isPlainObject(v) ? v : {};
    const title = text(item.title);
    const filter = text(item.filter) as AnswerDropped["filter"];
    const reason = text(item.reason);
    if (title === "" || reason === "" || !FILTERS.includes(filter)) {
      problems.push(`dropped ${i + 1}: title, filter and reason are needed`);
      return;
    }
    out.push({ title, filter, reason });
  });
  return out;
}

/** shownIds: the ids handed to the model; an id outside them is a problem. */
export function checkLearnAnswer(value: unknown, shownIds: ReadonlySet<string>): Checked<LearnAnswer> {
  if (!isPlainObject(value)) return { ok: false, problems: ["the answer is not an object"] };
  if (!Array.isArray(value.motifs)) return { ok: false, problems: ["motifs must be a list"] };
  const problems: string[] = [];
  if (value.motifs.length > MAX_MOTIFS_PER_AXIS) problems.push(`at most 3 motifs, not ${value.motifs.length}`);
  const motifs: AnswerMotif[] = [];
  // A motif's id hashes its axis and its rows: two motifs of one set of rows would share it, and one decision.
  const rowSets = new Map<string, number>();
  value.motifs.forEach((m, i) => {
    const motif = checkMotif(m, i + 1, shownIds, problems);
    if (!motif) return;
    motifs.push(motif);
    const key = [...motif.rows].sort().join(",");
    const first = rowSets.get(key);
    if (first === undefined) rowSets.set(key, i + 1);
    else problems.push(`motif ${i + 1}: the same rows as motif ${first}: merge them into one motif`);
  });
  const dropped = checkDropped(value.dropped, problems);
  return problems.length > 0 ? { ok: false, problems } : { ok: true, value: { motifs, dropped } };
}
