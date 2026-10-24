// The harness's agent memory read as shared-memory candidates (lot M-9, temp/05 § 8.2), pure: one
// top-level list item of a .claude/agent-memory/<agent>/MEMORY.md is one entry, its linked note (a
// .md file of the same folder) read when there is one. Every entry becomes a `method` candidate whose
// source is the import itself: /memory-admit still asks for each one.

import { MAX_BODY_CHARS, MAX_TITLE_CHARS, entryIdPrefix } from "./entry.ts";
import type { MemoryEntry } from "./entry.ts";
import { topicOf } from "./refused.ts";

/** The harness's agent memory, relative to the project. */
export const HARNESS_AGENT_MEMORY_DIR = ".claude/agent-memory";
export const AGENT_MEMORY_INDEX = "MEMORY.md";
/** How many characters of a linked note are read. */
export const MAX_NOTE_CHARS = 8_000;

export interface AgentMemoryItem {
  /** 1-based line of the item in MEMORY.md. */
  line: number;
  title: string;
  /** The text after the link (or the whole item when it has none). */
  hook: string;
  /** The linked note's file name, when it is a plain .md name of the agent's folder. */
  note?: string;
}

const ITEM = /^[-*]\s+(.*)$/;
const LINKED = /^\[([^\]]+)\]\(([^)\s]+)\)\s*(?:[—–:-]+\s*)?(.*)$/;
const NOTE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*\.md$/;

/** How many characters of a sentence (a hook, a Why, a How to apply) an entry keeps. */
export const MAX_SENTENCE_CHARS = 300;

const oneLine = (text: string): string => text.replace(/\s+/g, " ").trim();
const plain = (text: string): string => text.replace(/\*\*|__|`/g, "");

/** At most `max` characters, cut at a word. */
function cut(text: string, max: number): string {
  const t = oneLine(text);
  if (Array.from(t).length <= max) return t;
  const head = Array.from(t).slice(0, max - 1).join("");
  const at = head.lastIndexOf(" ");
  return `${(at > max / 2 ? head.slice(0, at) : head).trimEnd()}…`;
}

/** A title of at most MAX_TITLE_CHARS, cut at a word. */
export function shortTitle(text: string): string {
  return cut(plain(text), MAX_TITLE_CHARS);
}

/** The entries of a MEMORY.md: its top-level list items, an indented line continuing the item above. */
export function parseAgentMemoryIndex(text: string): AgentMemoryItem[] {
  const items: Array<{ line: number; text: string }> = [];
  let fenced = false;
  let current: { line: number; text: string } | null = null;
  text.replace(/\r\n?/g, "\n").split("\n").forEach((raw, i) => {
    if (/^\s*(```|~~~)/.test(raw)) { fenced = !fenced; current = null; return; }
    if (fenced) return;
    const m = ITEM.exec(raw);
    if (m !== null) {
      current = { line: i + 1, text: m[1] };
      items.push(current);
    } else if (current !== null && /^\s+\S/.test(raw)) {
      current.text += ` ${raw.trim()}`;
    } else {
      current = null;
    }
  });
  return items.flatMap(({ line, text: item }) => {
    const body = oneLine(item);
    // A thematic break (`* * *`, `- - -`) is not an entry.
    if (body === "" || /^([-*_])(\s*\1)+$/.test(body)) return [];
    const link = LINKED.exec(body);
    if (link === null) return [{ line, title: shortTitle(body), hook: body }];
    const title = shortTitle(link[1]);
    const hook = oneLine(link[3]) || title;
    return [NOTE_NAME.test(link[2]) ? { line, title, hook, note: link[2] } : { line, title, hook }];
  }).filter((item) => /[A-Za-z0-9]/.test(item.title));
}

export interface AgentNote {
  /** The note without its front matter. */
  body: string;
  why?: string;
  howToApply?: string;
}

/** A linked note: its front matter dropped, its `**Why:**` and `**How to apply:**` sentences picked. */
export function parseAgentNote(text: string): AgentNote {
  let body = text.replace(/\r\n?/g, "\n");
  const fm = /^---\n[\s\S]*?\n---\n?/.exec(body);
  if (fm !== null) body = body.slice(fm[0].length);
  body = body.trim();
  // A label is a bold run ending in a colon (`**Why:**`); a sentence ends at the next label or a blank line.
  const pick = (label: string): string | undefined => {
    const m = new RegExp(`\\*\\*${label}:\\*\\*\\s*([\\s\\S]*?)(?=\\*\\*[A-Za-z][^*\\n]{0,30}:\\*\\*|\\n\\s*\\n|$)`, "i").exec(body);
    const value = m === null ? "" : oneLine(m[1]);
    return value === "" ? undefined : value;
  };
  const note: AgentNote = { body };
  const why = pick("Why");
  const how = pick("How to apply");
  if (why !== undefined) note.why = why;
  if (how !== undefined) note.howToApply = how;
  return note;
}

export interface ImportContext {
  agent: string;
  project: string;
  /** YYYY-MM-DD. */
  date: string;
}

const TAG = /^[a-z0-9][a-z0-9.+#-]*$/;

/** The candidate an item becomes (its id not yet made unique; the domain's entryProblems still applies). */
export function importedEntry(item: AgentMemoryItem, note: AgentNote | null, ctx: ImportContext): MemoryEntry {
  const index = `${HARNESS_AGENT_MEMORY_DIR}/${ctx.agent}/${AGENT_MEMORY_INDEX}`;
  const topic = topicOf(item.title);
  const evidence = [`- \`${index}:${item.line}\``];
  if (note !== null && item.note !== undefined) evidence.push(`- \`${HARNESS_AGENT_MEMORY_DIR}/${ctx.agent}/${item.note}\``);
  const hook = cut(item.hook, MAX_SENTENCE_CHARS);
  const head = ["## Context", `Imported from the harness agent memory of ${ctx.agent} (${index}, line ${item.line}).`];
  // Without a note the item itself is the content: it is not repeated here.
  if (note !== null && item.hook !== item.title) head.push(hook);
  const tail = ["", "## Evidence", ...evidence];
  // A note's own headings are flattened: the entry's three sections stay the only ones.
  let fenced = false;
  const content = (note?.body ?? item.hook).split("\n").map((l) => {
    if (/^\s*(```|~~~)/.test(l)) fenced = !fenced;
    return fenced ? l : l.replace(/^#{1,6}\s+/, "");
  }).join("\n").trim() || item.title;
  const room = MAX_BODY_CHARS - (head.join("\n").length + tail.join("\n").length + "\n\n## Content\n\n".length + 1);
  const shown = content.length <= room ? content : `${content.slice(0, Math.max(0, room - 1)).trimEnd()}…`;
  return {
    id: `${entryIdPrefix(ctx.project, "method", ctx.date)}${topic}`,
    type: "method", title: item.title, project: ctx.project, date: ctx.date, topic,
    appliesWhen: cut(note?.howToApply ?? hook, MAX_SENTENCE_CHARS), rationale: cut(note?.why ?? hook, MAX_SENTENCE_CHARS),
    source: `human:${ctx.date} import ${index}`, status: "candidate", supersedes: [],
    tags: ["agent-memory", ...(TAG.test(ctx.agent) ? [ctx.agent] : [])], stack: [],
    body: [...head, "", "## Content", shown, ...tail].join("\n") + "\n",
  };
}
