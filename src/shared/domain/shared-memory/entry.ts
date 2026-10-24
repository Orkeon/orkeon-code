// A shared-memory entry, pure: its fields, its id scheme, and the checks that decide
// whether it may be stored as data (shape, secrets, provenance markers). Parsing the
// file lives in front-matter.ts; this module never reads or writes anything.

import { secretLikePaths, secretPatternsIn } from "../secret-patterns.ts";
import { TOPIC_PATTERN } from "./refused.ts";

export const ENTRY_TYPES = ["decision", "code-structure", "method", "mistake"] as const;
export type EntryType = (typeof ENTRY_TYPES)[number];
export const ENTRY_STATUSES = ["candidate", "admitted", "superseded"] as const;
export type EntryStatus = (typeof ENTRY_STATUSES)[number];
export const SOURCE_KINDS = ["verdict", "audit", "human"] as const;
/** The front-matter keys, in the order serializeEntry writes them (temp/05 § 2). */
export const ENTRY_KEYS: readonly string[] = [
  "id", "type", "title", "project", "date", "topic", "applies_when", "rationale", "correction", "detection_signal",
  "source", "status", "supersedes", "superseded_by", "tags", "stack",
];
export const ENTRY_SECTIONS = ["Context", "Content", "Evidence"] as const;
export const MAX_TITLE_CHARS = 90;
export const MAX_BODY_CHARS = 2_000;
export const MAX_TOPIC_CHARS = 60;

export interface MemoryEntry {
  id: string; type: EntryType; title: string; project: string; date: string; topic: string;
  appliesWhen: string; rationale: string; correction?: string; detectionSignal?: string;
  source: string; status: EntryStatus; supersedes: string[]; supersededBy?: string;
  tags: string[]; stack: string[];
  /** The text after the front matter, from "## Context" on. */
  body: string;
}

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SOURCE = /^(verdict|audit|human):\S/;
const TOKEN = /^[a-z0-9][a-z0-9.+#-]*$/;

/** "<project>-<type>-<yyyymmdd>-": what every id of this project, type and date starts with. */
export function entryIdPrefix(project: string, type: EntryType, date: string): string {
  return `${project}-${type}-${date.replace(/-/g, "")}-`;
}

function isCalendarDate(text: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!m) return false;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

const present = (value: string | undefined): boolean => value !== undefined && value.trim() !== "";

/** The front-matter values of the entry, by key, in ENTRY_KEYS order (absent optional keys left out). */
function entryValues(entry: MemoryEntry): Array<[string, string]> {
  const values: Record<string, string | string[] | undefined> = {
    id: entry.id, type: entry.type, title: entry.title, project: entry.project, date: entry.date, topic: entry.topic,
    applies_when: entry.appliesWhen, rationale: entry.rationale, correction: entry.correction,
    detection_signal: entry.detectionSignal, source: entry.source, status: entry.status, supersedes: entry.supersedes,
    superseded_by: entry.supersededBy, tags: entry.tags, stack: entry.stack,
  };
  return ENTRY_KEYS.flatMap((key): Array<[string, string]> => {
    const value = values[key];
    if (value === undefined) return [];
    return [[key, Array.isArray(value) ? value.join("\n") : String(value)]];
  });
}

/** The paths the "## Evidence" section names, as `path` or path:line, each once. */
function evidencePaths(body: string): string[] {
  const lines = body.split("\n");
  const start = lines.findIndex((line) => /^## Evidence\s*$/.test(line));
  if (start < 0) return [];
  const end = lines.findIndex((line, i) => i > start && /^## /.test(line));
  const section = lines.slice(start + 1, end < 0 ? undefined : end).join("\n");
  const paths: string[] = [];
  for (const m of section.matchAll(/`([^`\s]+)`/g)) paths.push(m[1].replace(/:\d+(?:-\d+)?$/, ""));
  for (const m of section.replace(/`[^`]*`/g, " ").matchAll(/([^\s`'"(),;]+):\d+/g)) paths.push(m[1]);
  return [...new Set(paths.filter((path) => path.length > 0))];
}

function sectionsInOrder(body: string): boolean {
  const lines = body.split("\n");
  let from = 0;
  for (const name of ENTRY_SECTIONS) {
    const at = lines.findIndex((line, i) => i >= from && line.trimEnd() === `## ${name}`);
    if (at < 0) return false;
    from = at + 1;
  }
  return true;
}

/** Every problem, in the order of the design's table; empty when the entry is admissible as data. */
export function entryProblems(entry: MemoryEntry, markers: readonly RegExp[] = []): string[] {
  const problems: string[] = [];
  const typeOk = (ENTRY_TYPES as readonly string[]).includes(entry.type);
  const prefix = entryIdPrefix(entry.project, entry.type, entry.date);
  if (!KEBAB.test(entry.id) || !entry.id.startsWith(prefix) || !KEBAB.test(entry.id.slice(prefix.length))) {
    problems.push(`id '${entry.id}' is not ${entry.project}-${entry.type}-${entry.date.replace(/-/g, "")}-<slug>`);
  }
  if (!typeOk) problems.push(`type must be one of ${ENTRY_TYPES.join(", ")}`);
  if (entry.title.length < 1 || entry.title.length > MAX_TITLE_CHARS || /[\r\n]/.test(entry.title)) {
    problems.push(`title must be one line of 1 to ${MAX_TITLE_CHARS} characters`);
  }
  if (!KEBAB.test(entry.project)) problems.push(`project '${entry.project}' is not a kebab-case name`);
  if (!isCalendarDate(entry.date)) problems.push(`date '${entry.date}' is not YYYY-MM-DD`);
  if (!TOPIC_PATTERN.test(entry.topic)) {
    problems.push(`topic '${entry.topic}' is not a kebab slug of at most ${MAX_TOPIC_CHARS} characters`);
  }
  if (!present(entry.appliesWhen)) problems.push("applies_when is empty");
  if (!present(entry.rationale)) problems.push("rationale is empty");
  const mistakeKeys: Array<[string, string | undefined]> = [
    ["correction", entry.correction], ["detection_signal", entry.detectionSignal],
  ];
  for (const [key, value] of mistakeKeys) {
    if (entry.type === "mistake" && !present(value)) problems.push(`a mistake needs ${key}`);
    if (entry.type !== "mistake" && present(value)) problems.push(`${key} is for a mistake only`);
  }
  if (!SOURCE.test(entry.source)) problems.push("source must start with verdict:, audit: or human:");
  if (!(ENTRY_STATUSES as readonly string[]).includes(entry.status)) {
    problems.push(`status must be one of ${ENTRY_STATUSES.join(", ")}`);
  }
  for (const id of entry.supersedes) {
    if (!id.startsWith(`${entry.project}-`)) problems.push(`supersedes '${id}' is not an entry of project ${entry.project}`);
  }
  if ((entry.status === "superseded") !== present(entry.supersededBy)) {
    problems.push("superseded_by is set exactly when status is superseded");
  }
  for (const [key, items] of [["tags", entry.tags], ["stack", entry.stack]] as const) {
    for (const item of items) if (!TOKEN.test(item)) problems.push(`${key} item '${item}' is not a lower-case token`);
  }
  if (!sectionsInOrder(entry.body)) problems.push("the body needs ## Context, ## Content and ## Evidence, in this order");
  if (entry.body.length > MAX_BODY_CHARS) {
    problems.push(`the body is ${entry.body.length} characters, over ${MAX_BODY_CHARS}`);
  }
  for (const path of secretLikePaths(evidencePaths(entry.body))) problems.push(`evidence names a secret-like file: ${path}`);
  const texts: Array<[string, string]> = [...entryValues(entry), ["body", entry.body]];
  for (const [key, text] of texts) {
    for (const name of secretPatternsIn(text)) problems.push(`${key} looks like it holds a secret (${name})`);
  }
  for (const [key, text] of texts) {
    for (const marker of markers) {
      if (new RegExp(marker.source, marker.flags.replace(/[gy]/g, "")).test(text)) {
        problems.push(`${key} carries a provenance marker (${marker.source})`);
      }
    }
  }
  return problems;
}
