// The flat front matter of a memory entry, pure: "---", one "key: value" per line (a
// scalar, a JSON string, or an inline list), "---", then the body as written. No
// nesting and no comments: a "#" in a value is text. The parser is ours because the
// runtime loads no package, and it lives in the domain so the use cases test in Node.

import { ENTRY_KEYS } from "./entry.ts";
import type { EntryStatus, EntryType, MemoryEntry } from "./entry.ts";

export type FlatValue = string | string[];
export interface FrontMatter { fields: Array<{ key: string; value: FlatValue; line: number }>; body: string }
export type FrontMatterParse = { ok: true; doc: FrontMatter } | { ok: false; problems: string[] };

const FENCE = "---";
const KEY_LINE = /^([a-z][a-z_]*):(?: (.*))?$/;

class ValueError extends Error {}

/** One JSON string starting at `from`; returns the decoded text and the index after it. */
function readQuoted(text: string, from: number): { value: string; next: number } {
  let i = from + 1;
  while (i < text.length && text[i] !== "\"") i += text[i] === "\\" ? 2 : 1;
  if (i >= text.length) throw new ValueError("bad quoted value");
  let value: unknown;
  try { value = JSON.parse(text.slice(from, i + 1)); } catch { throw new ValueError("bad quoted value"); }
  if (typeof value !== "string") throw new ValueError("bad quoted value");
  return { value, next: i + 1 };
}

function parseList(inner: string): string[] {
  if (inner.trim() === "") return [];
  const items: string[] = [];
  let i = 0;
  for (;;) {
    while (inner[i] === " ") i++;
    if (inner[i] === "\"") {
      const quoted = readQuoted(inner, i);
      items.push(quoted.value);
      i = quoted.next;
      while (inner[i] === " ") i++;
      if (i < inner.length && inner[i] !== ",") throw new ValueError("bad quoted value");
    } else {
      const comma = inner.indexOf(",", i);
      const item = inner.slice(i, comma < 0 ? inner.length : comma).trim();
      if (/[[\]]/.test(item)) throw new ValueError("unclosed list");
      if (item.includes("\"")) throw new ValueError("bad quoted value");
      items.push(item);
      i = comma < 0 ? inner.length : comma;
    }
    if (i >= inner.length) return items;
    i++; // the comma
  }
}

function parseValue(raw: string): FlatValue {
  const text = raw.trim();
  if (text.startsWith("[")) {
    if (!text.endsWith("]")) throw new ValueError("unclosed list");
    return parseList(text.slice(1, -1));
  }
  if (text.startsWith("\"")) {
    const quoted = readQuoted(text, 0);
    if (quoted.next !== text.length) throw new ValueError("bad quoted value");
    return quoted.value;
  }
  return text;
}

export function parseFrontMatter(text: string): FrontMatterParse {
  const lines = String(text ?? "").split("\n");
  const strip = (line: string): string => line.replace(/\r$/, "");
  if (strip(lines[0]) !== FENCE) return { ok: false, problems: ["line 1: the front matter must open with ---"] };
  const close = lines.findIndex((line, i) => i > 0 && strip(line) === FENCE);
  if (close < 0) return { ok: false, problems: ["the front matter is not closed by ---"] };
  const problems: string[] = [];
  const fields: FrontMatter["fields"] = [];
  const seen = new Set<string>();
  for (let i = 1; i < close; i++) {
    const raw = strip(lines[i]);
    const n = i + 1;
    const m = KEY_LINE.exec(raw);
    if (!m) { problems.push(`line ${n}: '${raw}' is not key: value`); continue; }
    const key = m[1];
    if (seen.has(key)) { problems.push(`line ${n}: duplicate key '${key}'`); continue; }
    seen.add(key);
    try {
      fields.push({ key, value: parseValue(m[2] ?? ""), line: n });
    } catch (error) {
      if (!(error instanceof ValueError)) throw error;
      problems.push(`line ${n}: ${error.message}`);
    }
  }
  if (problems.length > 0) return { ok: false, problems };
  return { ok: true, doc: { fields, body: lines.slice(close + 1).join("\n") } };
}

function needsQuotes(value: string): boolean {
  return value === "" || value.startsWith("[") || value.startsWith("\"") || value !== value.trim()
    || value.includes(": ") || value.includes(" #");
}

function itemNeedsQuotes(item: string): boolean {
  return item === "" || item !== item.trim() || /[,[\]"]/.test(item) || /[\r\n]/.test(item);
}

function writeValue(key: string, value: FlatValue): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => (itemNeedsQuotes(item) ? JSON.stringify(item) : item)).join(", ")}]`;
  }
  if (/[\r\n]/.test(value)) throw new Error(`a front-matter value is one line: ${key}`);
  return needsQuotes(value) ? JSON.stringify(value) : value;
}

export function serializeFrontMatter(doc: FrontMatter): string {
  const lines = doc.fields.map((field) => `${field.key}: ${writeValue(field.key, field.value)}`);
  return [FENCE, ...lines, FENCE].join("\n") + "\n" + doc.body;
}

const LIST_KEYS = new Set(["supersedes", "tags", "stack"]);
const OPTIONAL_KEYS = new Set(["correction", "detection_signal", "superseded_by", "supersedes", "tags", "stack"]);

export function entryFromFrontMatter(
  doc: FrontMatter,
): { ok: true; entry: MemoryEntry } | { ok: false; problems: string[] } {
  const problems: string[] = [];
  const text: Record<string, string> = {};
  const lists: Record<string, string[]> = {};
  for (const { key, value } of doc.fields) {
    if (!ENTRY_KEYS.includes(key)) { problems.push(`unknown key '${key}'`); continue; }
    if (LIST_KEYS.has(key)) {
      if (Array.isArray(value)) lists[key] = value;
      else problems.push(`${key} must be a list`);
    } else if (Array.isArray(value)) {
      problems.push(`${key} must be text`);
    } else {
      text[key] = value;
    }
  }
  const given = new Set(doc.fields.map((field) => field.key));
  for (const key of ENTRY_KEYS) {
    if (!OPTIONAL_KEYS.has(key) && !given.has(key)) problems.push(`missing key '${key}'`);
  }
  if (problems.length > 0) return { ok: false, problems };
  const entry: MemoryEntry = {
    id: text.id, type: text.type as EntryType, title: text.title, project: text.project, date: text.date,
    topic: text.topic, appliesWhen: text.applies_when, rationale: text.rationale,
    source: text.source, status: text.status as EntryStatus,
    supersedes: lists.supersedes ?? [], tags: lists.tags ?? [], stack: lists.stack ?? [],
    body: doc.body,
  };
  if (text.correction !== undefined) entry.correction = text.correction;
  if (text.detection_signal !== undefined) entry.detectionSignal = text.detection_signal;
  if (text.superseded_by !== undefined) entry.supersededBy = text.superseded_by;
  return { ok: true, entry };
}

/** The entry's front matter, keys in ENTRY_KEYS order, optional absent keys omitted. */
export function entryToFrontMatter(entry: MemoryEntry): FrontMatter {
  const values: Record<string, FlatValue | undefined> = {
    id: entry.id, type: entry.type, title: entry.title, project: entry.project, date: entry.date, topic: entry.topic,
    applies_when: entry.appliesWhen, rationale: entry.rationale, correction: entry.correction,
    detection_signal: entry.detectionSignal, source: entry.source, status: entry.status, supersedes: entry.supersedes,
    superseded_by: entry.supersededBy, tags: entry.tags, stack: entry.stack,
  };
  const fields: FrontMatter["fields"] = [];
  for (const key of ENTRY_KEYS) {
    const value = values[key];
    if (value !== undefined) fields.push({ key, value, line: fields.length + 2 });
  }
  return { fields, body: entry.body };
}

export function parseEntry(text: string): { ok: true; entry: MemoryEntry } | { ok: false; problems: string[] } {
  const parsed = parseFrontMatter(text);
  return parsed.ok ? entryFromFrontMatter(parsed.doc) : parsed;
}

export function serializeEntry(entry: MemoryEntry): string {
  return serializeFrontMatter(entryToFrontMatter(entry));
}
