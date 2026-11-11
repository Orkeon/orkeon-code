// Pure compaction helpers — no IO. The prompts of the compaction (the summary and
// the memory extraction), the markers the model later reads in its history, and
// the buffer rewrite. Shared by /compact and the main loop's automatic compaction
// (shared/application/compaction/). The prompt text is written from the
// specification in docs/turn.md, "Compaction and memory".
//
// Run tests: node --test src/shared/domain/compaction.test.ts

import type { CompactBoundaryMessage, PromptPair, SessionMsg } from "./types.ts";
import { MAX_EXTRACTED_MEMORIES, TRANSCRIPT_CAP_CHARS } from "./compaction-thresholds.ts";
import { MEMORY_CATEGORIES } from "./agent-policy/memory-categories.ts";
import { COMPACT_BOUNDARY_MARKER, COMPACTED_HEADER, SUMMARY_CLOSE, SUMMARY_OPEN } from "./markers.ts";
import {
  EVERY_TDD_LINE_TICKED, EXTRACTION_TRANSCRIPT_INTRO, firstOpenStep, KNOWN_MEMORIES, KNOWN_MEMORIES_WITH_IDS,
  MEMORY_EXTRACTION_INSTRUCTIONS, MEMORY_RECAP_HEADING, middleLeftOut, restoredFile, restoredFileNotice, restoredSkill,
  restoredState, SNIP_NOTICE, SUMMARY_INSTRUCTIONS, summaryClosing, summaryFocus, todayIs,
} from "./prompts.ts";

/** A buffer with this many messages or fewer is not worth compacting. */
export const MIN_COMPACTABLE = 2;

/** Render the conversation buffer as a `role: content` transcript. */
export function buildTranscript(messages: SessionMsg[]): string {
  return messages.map((m) => `${m.role}: ${m.content}`).join("\n");
}

/** Ceiling on the summary's length, stated to the model, in words. */
export const SUMMARY_MAX_WORDS = 900;

/**
 * Fit a transcript to `cap` characters, keeping its head and its tail.
 *
 * The head holds the task as the user first stated it, the tail the current work:
 * cutting at the head (as a plain slice does) loses the recent work first, which is
 * exactly what the next turn needs. A quarter goes to the head, the rest to the
 * tail, and the marker in between says how much was left out.
 */
export function clipTranscript(transcript: string, cap: number): string {
  if (transcript.length <= cap) return transcript;
  const head = Math.floor(cap / 4);
  const tail = cap - head;
  const omitted = transcript.length - head - tail;
  return (
    transcript.slice(0, head) +
    middleLeftOut(omitted) +
    transcript.slice(transcript.length - tail)
  );
}

/** The transcript as material: between fixed tags, after the instructions. */
function asMaterial(transcript: string): string {
  return "<transcript>\n" + clipTranscript(transcript, TRANSCRIPT_CAP_CHARS) + "\n</transcript>";
}

/**
 * Prompt that asks the model for the compaction summary.
 *
 * The summary REPLACES the history, so it is written for a reader who resumes
 * cold, not as a recap; what comes back on its own after a compaction (memory,
 * the instructions file, the playbooks, a few files read back) is named so the
 * summary spends its words on the state of the work. The answer goes between fixed markers so the
 * host stores the summary and nothing else. `focus` is the operator's
 * `/compact <focus>`. The instructions are the system message, the transcript the
 * user message.
 */
export function buildSummaryPrompt(transcript: string, focus?: string): PromptPair {
  const lines = [...SUMMARY_INSTRUCTIONS];
  const keep = String(focus ?? "").trim();
  if (keep.length > 0) {
    lines.push("", summaryFocus(keep));
  }
  lines.push("", summaryClosing(SUMMARY_MAX_WORDS, SUMMARY_OPEN, SUMMARY_CLOSE));
  return { system: lines.join("\n"), user: asMaterial(transcript) };
}

/**
 * The summary the model wrote: the text between the markers when it used them
 * (the last closing marker, so a marker quoted inside the summary does not cut
 * it), else the whole reply. "" means the model returned nothing usable.
 */
export function extractSummary(raw: string): string {
  const text = String(raw ?? "");
  const open = text.indexOf(SUMMARY_OPEN);
  const close = text.lastIndexOf(SUMMARY_CLOSE);
  if (open >= 0 && close > open) return text.slice(open + SUMMARY_OPEN.length, close).trim();
  return text.split(SUMMARY_OPEN).join("").split(SUMMARY_CLOSE).join("").trim();
}

/** The typed boundary inserted as the FIRST post-compact message. */
export function buildCompactBoundaryMessage(): CompactBoundaryMessage {
  return { role: "system", subtype: "compact_boundary", content: COMPACT_BOUNDARY_MARKER };
}

/**
 * The note left in the buffer when earlier turns were cut with no summary (a snip
 * alone). It opens with [compacted] so the history reads it as material, and it is
 * no boundary: `isCompactBoundary` matches the subtype or `[compact-boundary]` only,
 * and the history block hides boundaries, while this note must be read.
 */
export function buildSnipNoticeMessage(): SessionMsg {
  return { role: "system", content: SNIP_NOTICE };
}

/** True for a compaction boundary — by subtype when present, else by marker. */
export function isCompactBoundary(msg: any): boolean {
  return String(msg?.subtype ?? "") === "compact_boundary"
    || String(msg?.content ?? "").startsWith(COMPACT_BOUNDARY_MARKER);
}

/** Count the compaction boundaries in a buffer (`/context` display). */
export function countCompactBoundaries(messages: any[]): number {
  return (messages ?? []).filter(isCompactBoundary).length;
}

/** Rewrite the buffer: keep the first message as an anchor, insert the typed
 *  boundary, then replace the rest with the summary. `head` verbatim: the entry
 *  as the session stored it, whatever its shape. */
export function buildCompactedBuffer<Head>(head: Head, summary: string): Array<Head | SessionMsg> {
  return [
    head,
    buildCompactBoundaryMessage(),
    { role: "system", content: COMPACTED_HEADER + "\n" + summary.trim() },
  ];
}

// ── Post-compaction file restoration — pure parts ───────────────────────

// A path-like token: at least one directory separator and a dotted extension,
// not part of a URL. Kept deliberately conservative — a missed path only means
// one fewer restored file, while a false positive costs a failed fileRead.
const FILE_PATH_RE = /(?:^|[\s"'`(\[<=:])((?:\/|\.{1,2}\/)?(?:[\w@.-]+\/)+[\w@.-]+\.[A-Za-z0-9]{1,8})(?=$|[\s"'`)\]>,;])/g;

/** Extract path-like tokens from the buffer, most recent first, deduped. */
export function extractRecentFilePaths(messages: SessionMsg[], cap: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (let i = (messages ?? []).length - 1; i >= 0 && out.length < cap; i--) {
    const content = String(messages[i]?.content ?? "");
    if (content.includes("://")) continue; // URL-bearing lines: skip cheaply, not worth splitting
    const local: string[] = [];
    let m: RegExpExecArray | null;
    FILE_PATH_RE.lastIndex = 0;
    while ((m = FILE_PATH_RE.exec(content)) !== null) local.push(m[1]);
    // Within one message keep textual order; messages themselves are walked
    // newest-first so the overall order is recency.
    for (const p of local) {
      if (seen.has(p)) continue;
      seen.add(p);
      out.push(p);
      if (out.length >= cap) break;
    }
  }
  return out;
}

/** The message that points at the state file written before the compaction (step 0): the
 *  batch in progress, where its facts are, and the step to resume at. */
export function buildRestoredStateMessage(path: string, firstOpen: string | null): SessionMsg {
  const resume = firstOpen === null ? EVERY_TDD_LINE_TICKED : firstOpenStep(firstOpen);
  return { role: "system", content: restoredState(resume, path) };
}

/** The re-injected file message: the whole content between an opening line that
 *  says what it is and a closing marker, so the model sees where the copy ends. */
export function buildRestoredFileMessage(path: string, content: string): SessionMsg {
  return { role: "system", content: restoredFile(path, content) };
}

/** A file too large to read back whole: its path and a note, never a cut copy (a
 *  cut copy could feed a whole-file write and erase the rest of the file). */
export function buildRestoredFileNotice(path: string): SessionMsg {
  return { role: "system", content: restoredFileNotice(path) };
}

/**
 * A skill re-injected after compaction.
 *
 * A distinct marker from `[restored-file]` on purpose: a file came back because
 * the agent had just touched it, a skill came back because the operator attached
 * it and expects it to survive every compaction. Reading the buffer afterwards,
 * the two answer different questions.
 */
export function buildRestoredSkillMessage(path: string, content: string): SessionMsg {
  return { role: "system", content: restoredSkill(path, content) };
}

/** One durable fact extracted from the conversation before compaction; `replaces` is the id of the known entry it
 *  makes out of date, when it names one the prompt listed, of the same category. */
export interface ExtractedMemory {
  category: string;
  content: string;
  replaces?: number;
}

/** An entry the memory store already holds, as the extraction prompt lists it: by its id when the store gives one. */
export interface KnownMemory {
  id?: number;
  /** Undefined when the store reports none: such an entry is never replaced. */
  category?: string;
  content: string;
}

/** JSON schema handed to the extraction call of the pre-compaction memory pass. */
export const MEMORY_EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          category: { type: "string", enum: [...MEMORY_CATEGORIES] },
          content: { type: "string" },
          replaces: { type: "integer" },
        },
        required: ["category", "content"],
      },
    },
  },
  required: ["items"],
} as const;

/** How many known memories the extraction prompt lists, so it can skip them. */
export const MAX_KNOWN_MEMORIES_IN_PROMPT = 40;

/** The known entries the extraction prompt lists: the non-empty ones, trimmed, capped. */
function listedKnown(known: readonly KnownMemory[]): KnownMemory[] {
  return known
    .map((k) => ({ ...k, content: String(k.content ?? "").trim() }))
    .filter((k) => k.content.length > 0)
    .slice(0, MAX_KNOWN_MEMORIES_IN_PROMPT);
}

/**
 * Prompt for the memory extraction run before a compaction.
 *
 * Each category is defined together with what does not belong in it, because the
 * failure is never an empty list: it is task state stored as memory. `known` are
 * the entries the store already holds, listed so the model does not repeat them, each
 * by its id when it has one, so a new fact can name the stale entry it replaces.
 * `today` (YYYY-MM-DD), when given, is stated so a relative date becomes an absolute one.
 */
export function buildMemoryExtractionPrompt(transcript: string, known: readonly KnownMemory[] = [], today?: string): string {
  const lines = [...MEMORY_EXTRACTION_INSTRUCTIONS];
  const date = String(today ?? "").trim();
  if (date.length > 0) {
    lines.splice(1, 0, todayIs(date));
  }
  const already = listedKnown(known);
  if (already.length > 0) {
    const intro = already.some((k) => k.id !== undefined) ? KNOWN_MEMORIES_WITH_IDS : KNOWN_MEMORIES;
    lines.push("", intro, ...already.map((k) => `- ${k.id === undefined ? "" : `[${k.id}] `}${k.content}`));
  }
  lines.push("", EXTRACTION_TRANSCRIPT_INTRO, asMaterial(transcript));
  return lines.join("\n");
}

/** Keep only well-formed items with a valid category, capped. An item keeps its `replaces` when it names an entry of
 *  `known` the prompt listed, of the item's own category (the store's `replace` keeps the entry's category), and the
 *  first item to name it only; any other item is added. */
export function sanitizeExtractedMemories(raw: any, known: readonly KnownMemory[] = []): ExtractedMemory[] {
  const items: any[] = Array.isArray(raw?.items) ? raw.items : Array.isArray(raw) ? raw : [];
  const valid = new Set<string>(MEMORY_CATEGORIES);
  const replaceable = new Map(listedKnown(known).flatMap((k) => (k.id === undefined ? [] : [[k.id, k.category] as const])));
  const kept = items
    .map((it) => ({
      category: String(it?.category ?? "").trim(),
      content: String(it?.content ?? "").trim(),
      replaces: it?.replaces,
    }))
    .filter((it) => valid.has(it.category) && it.content.length > 0)
    .slice(0, MAX_EXTRACTED_MEMORIES);
  return kept.map(({ replaces, ...it }) => {
    if (!Number.isInteger(replaces) || !replaceable.has(replaces) || replaceable.get(replaces) !== it.category) return it;
    replaceable.delete(replaces);
    return { ...it, replaces };
  });
}

/** Bounded recap re-injected after the rewrite so the memories stay visible until
 *  the Memory block of the next turn shows them. */
export function buildMemoryRecapMessage(items: ExtractedMemory[]): SessionMsg {
  const lines = items.map((it) => `- [${it.category}] ${it.content}`);
  return {
    role: "system",
    content: MEMORY_RECAP_HEADING + lines.join("\n"),
  };
}
