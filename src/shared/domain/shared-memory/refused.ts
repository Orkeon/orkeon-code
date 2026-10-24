// The refused motifs of the shared memory: one line per motif in
// `.orkeon/memory/refused.md`, read so the learning pass leaves them out, appended to
// when one is refused. Pure, no IO, never throws.
import { sha1Hex } from "../sha1.ts";
import { foldText } from "./verdict-rows.ts";

/** Orkeon Code's memory folder, relative to /workspace; M-2 makes it the default of memory.dir. */
export const MEMORY_DIR = ".orkeon/memory";
export const REFUSED_FILE = ".orkeon/memory/refused.md";
export interface RefusedMotif { topic: string; project: string; date: string; motif: string; line: number }
export interface RefusedList { motifs: RefusedMotif[]; problems: Array<{ line: number; message: string }> }
export const TOPIC_PATTERN: RegExp = /^(?=.{1,60}$)[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const REFUSED_HEADER: string =
  "One line per refused motif: topic | project | date | motif. /dev-learn leaves these topics out of its proposals.";

const TITLE = "# Refused motifs";
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SEPARATOR = " | ";
const TOPIC_MAX = 60;
const MOTIF_MAX = 200;

function slug(text: string): string {
  return foldText(text).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** A topic from free text: folded, non-alphanumeric runs as `-`, cut at a `-` within 60 characters. */
export function topicOf(text: string): string {
  let topic = slug(text);
  if (topic.length > TOPIC_MAX) {
    const cut = topic.lastIndexOf("-", TOPIC_MAX);
    topic = cut > 0 ? topic.slice(0, cut) : topic.slice(0, TOPIC_MAX);
  }
  return topic === "" ? `motif-${sha1Hex(text).slice(0, 8)}` : topic;
}

/** The project a git remote names (its last path segment, cleaned as a topic); null when nothing is left. */
export function projectFromRemote(url: string): string | null {
  let u = url.trim();
  for (;;) {
    if (u.endsWith("/")) u = u.slice(0, -1);
    else if (u.endsWith(".git")) u = u.slice(0, -4);
    else break;
  }
  const last = u.split(/[/:]/).pop() ?? "";
  const project = slug(last);
  return project === "" ? null : project;
}

export function parseRefused(text: string): RefusedList {
  const list: RefusedList = { motifs: [], problems: [] };
  text.split(/\r?\n/).forEach((raw, i) => {
    const t = raw.trim();
    const line = i + 1;
    if (t === "" || t.startsWith("#") || t === REFUSED_HEADER) return;
    const parts = t.split(SEPARATOR);
    const [topic, project, date] = parts.map((p) => p.trim());
    const motif = parts.slice(3).join(SEPARATOR).trim();
    if (parts.length < 4 || !TOPIC_PATTERN.test(topic) || !DATE.test(date)) {
      list.problems.push({ line, message: `line ${line}: not "topic | project | date | motif"` });
      return;
    }
    list.motifs.push({ topic, project, date, motif, line });
  });
  return list;
}

function clean(text: string): string {
  return text.replace(/\r?\n|\r/g, " ").replace(/\|/g, "/");
}

export function refusedLine(motif: Omit<RefusedMotif, "line">): string {
  let text = clean(motif.motif);
  const chars = Array.from(text);
  if (chars.length > MOTIF_MAX) text = chars.slice(0, MOTIF_MAX - 1).join("") + "…";
  return [motif.topic, clean(motif.project), motif.date, text].join(SEPARATOR);
}

/** The file after appending one line; the header when the file is new (previous null). Ends with "\n". */
export function appendRefused(previous: string | null, motif: Omit<RefusedMotif, "line">): string {
  const base = previous === null ? `${TITLE}\n\n${REFUSED_HEADER}\n\n` : previous;
  const sep = base === "" || base.endsWith("\n") ? "" : "\n";
  return `${base}${sep}${refusedLine(motif)}\n`;
}
