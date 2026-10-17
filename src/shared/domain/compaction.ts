// Pure compaction helpers — no IO. Moved from crews/session-compact/domain/
// (F3.2: the pipeline is now shared by session-compact AND the main-loop
// auto-compaction via shared/application/compaction/). Extended with the
// pre-compaction memory-extraction helpers (F3.4).

import type { CompactBoundaryMessage, SessionMsg } from "./types.ts";
import { MAX_EXTRACTED_MEMORIES, TRANSCRIPT_CAP_CHARS } from "./compaction-thresholds.ts";
import { MEMORY_CATEGORIES } from "./agent-policy/memory-categories.ts";

/** A buffer with this many messages or fewer is not worth compacting. */
export const MIN_COMPACTABLE = 2;

/** Render the conversation buffer as a `role: content` transcript. */
export function buildTranscript(messages: SessionMsg[]): string {
  return messages.map((m) => `${m.role}: ${m.content}`).join("\n");
}

/**
 * Prompt that asks the model to compact the transcript, preserving signal.
 *
 * Structured after the Claude Code compaction template (corpus
 * claude-code-system-prompts/, context-compaction-summary): the summary
 * REPLACES the history, so it is written as a continuation document — sections
 * ordered so a cold reader can resume — not a recap. The former three-line
 * PRESERVE/DROP prompt produced summaries that kept snippets but lost the
 * plan: what was tried and failed, and what remained, evaporated first.
 */
export function buildSummaryPrompt(transcript: string): string {
  return (
    "Summarise this conversation for context compaction: the history will be replaced " +
    "by your summary, and work must resume from it alone. Structure it in five sections:\n" +
    "1. Task overview — the user's core request, success criteria, constraints they stated.\n" +
    "2. Current state — what is done so far; files created, modified or analyzed (with paths); artifacts produced.\n" +
    "3. Important discoveries — constraints uncovered, decisions made and why, errors met and how they were fixed, approaches tried that failed (and why).\n" +
    "4. Next steps — the specific actions remaining, blockers or open questions, priority order.\n" +
    "5. Context to preserve — user preferences, non-obvious domain details, promises made to the user.\n" +
    "PRESERVE: explicit decisions, code snippets, file paths, and open tasks. DROP: chit-chat " +
    "and resolved tangents. Err on the side of including what prevents duplicate work or repeated mistakes.\n\n" +
    transcript.slice(0, TRANSCRIPT_CAP_CHARS)
  );
}

/** Content marker of the compaction boundary (E-9) — survives stores that
 *  round-trip only role/content, so detection never depends on `subtype`. */
export const COMPACT_BOUNDARY_MARKER = "[compact-boundary]";

/** The typed boundary inserted as the FIRST post-compact message (E-9). */
export function buildCompactBoundaryMessage(): CompactBoundaryMessage {
  return { role: "system", subtype: "compact_boundary", content: COMPACT_BOUNDARY_MARKER };
}

/** True for a compaction boundary — by subtype when present, else by marker. */
export function isCompactBoundary(msg: any): boolean {
  return String(msg?.subtype ?? "") === "compact_boundary"
    || String(msg?.content ?? "").startsWith(COMPACT_BOUNDARY_MARKER);
}

/** Count the compaction boundaries in a buffer (`/context` display, E-9). */
export function countCompactBoundaries(messages: any[]): number {
  return (messages ?? []).filter(isCompactBoundary).length;
}

/** Rewrite the buffer: keep the first message as an anchor, insert the typed
 *  boundary (E-9), then replace the rest with the summary. `head` verbatim: the
 *  entry as the session stored it, whatever its shape. */
export function buildCompactedBuffer<Head>(head: Head, summary: string): Array<Head | SessionMsg> {
  return [
    head,
    buildCompactBoundaryMessage(),
    { role: "system", content: "[compacted]\n" + summary.trim() },
  ];
}

// ── Post-compaction file restoration (E-4) — pure parts ──────────────────

// A path-like token: at least one directory separator and a dotted extension,
// not part of a URL. Kept deliberately conservative — a missed path only means
// one fewer restored file, while a false positive costs a failed fileRead.
const FILE_PATH_RE = /(?:^|[\s"'`(\[<=:])((?:\/|\.{1,2}\/)?(?:[\w@.-]+\/)+[\w@.-]+\.[A-Za-z0-9]{1,8})(?=$|[\s"'`)\]>,;])/g;

/** Extract path-like tokens from the buffer, most recent first, deduped (E-4). */
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

/** The re-injected file message: `[restored-file] <path>` + capped content (E-4). */
export function buildRestoredFileMessage(path: string, content: string): SessionMsg {
  return { role: "system", content: `[restored-file] ${path}\n${content}` };
}

/**
 * B-13: a skill re-injected after compaction.
 *
 * A distinct marker from `[restored-file]` on purpose: a file came back because
 * the agent had just touched it, a skill came back because the operator attached
 * it and expects it to survive every compaction. Reading the buffer afterwards,
 * the two answer different questions.
 */
export function buildRestoredSkillMessage(path: string, content: string): SessionMsg {
  return { role: "system", content: `[restored-skill] ${path}\n${content}` };
}

/** One durable fact extracted from the conversation before compaction. */
export interface ExtractedMemory {
  category: string;
  content: string;
}

/** JSON schema handed to ctx.llm.extract for the pre-compaction memory pass. */
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
        },
        required: ["category", "content"],
      },
    },
  },
  required: ["items"],
} as const;

/** Prompt for the pre-compaction memory extraction (F3.4). */
export function buildMemoryExtractionPrompt(transcript: string): string {
  return (
    "Before this conversation is compacted, extract the durable facts worth remembering across sessions. " +
    `Each item has a category among: ${MEMORY_CATEGORIES.join(", ")} ` +
    "(user = who the user is/preferences; project = ongoing work/decisions; feedback = corrections given; " +
    "reference = external pointers). Only genuinely durable facts — no transient task state. " +
    "Return { \"items\": [...] }; an empty list is a valid answer.\n\n" +
    transcript.slice(0, TRANSCRIPT_CAP_CHARS)
  );
}

/** Keep only well-formed items with a valid category, capped (F3.4). */
export function sanitizeExtractedMemories(raw: any): ExtractedMemory[] {
  const items: any[] = Array.isArray(raw?.items) ? raw.items : Array.isArray(raw) ? raw : [];
  const valid = new Set<string>(MEMORY_CATEGORIES);
  return items
    .map((it) => ({
      category: String(it?.category ?? "").trim(),
      content: String(it?.content ?? "").trim(),
    }))
    .filter((it) => valid.has(it.category) && it.content.length > 0)
    .slice(0, MAX_EXTRACTED_MEMORIES);
}

/** Bounded recap re-injected after the rewrite so the memories stay visible. */
export function buildMemoryRecapMessage(items: ExtractedMemory[]): SessionMsg {
  const lines = items.map((it) => `- [${it.category}] ${it.content}`);
  return { role: "system", content: "[memories]\n" + lines.join("\n") };
}
