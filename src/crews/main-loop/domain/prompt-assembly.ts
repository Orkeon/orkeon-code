// Prompt assembly for the main-loop act() turn — pure, no IO.
// Assembles the three messages of a turn. The static header (behaviour rules, tools,
// search playbook, the project's instructions file) is the SYSTEM prompt
// (`ActOptions.system`, a real `role:"system"` message). The volatile blocks
// (preferences, skills, memory, hooks, environment, history, gauge) are the CONTEXT
// (`ActOptions.context`, a user message of its own, Orkeon #276), in a fixed order;
// the request with its permission note is the prompt, the last user message. The
// system prompt is the absolute request prefix a provider caches, so it must be
// byte-identical turn after turn — no timestamps, no counters, no gauges; everything
// volatile goes in the context.
//
// The text of every block is written from the behaviour specification in
// docs/turn.md, "Prompt assembly" (ADR 0003).
//
// Run tests: node --test tests/crews/main-loop/domain/prompt-assembly.test.ts

import type { SessionMsg } from "../../../shared/domain/types.ts";
import { MEMORY_CATEGORIES } from "../../../shared/domain/agent-policy/memory-categories.ts";
import { isOutputStyle } from "../../../shared/domain/agent-policy/output-styles.ts";
import { pressureTier } from "../../../shared/domain/compaction-thresholds.ts";
import type { InstructionsFile } from "../../../shared/domain/instructions-file.ts";
import { isCompactBoundary } from "../../../shared/domain/compaction.ts";
import { isMarkedMessage } from "../../../shared/domain/marked-message.ts";

/** Sliding window over the session history (what exceeds it is the compaction's job). */
export const HISTORY_WINDOW = 50;

/** Cap per memory category in the prompt block. */
export const MAX_MEMORY_ENTRIES_PER_CATEGORY = 10;

import { describeSearchRouting } from "../../../shared/domain/search-routing.ts";
import { describeCodeIntelRouting } from "../../../shared/domain/code-intel-routing.ts";
import { NETWORK_READ_TOOLS } from "../../../shared/domain/agent-policy/permission.ts";
import {
  answerLanguageLine, ASKING_BLOCK, CARE_BLOCK, FINISHING_BLOCK, gaugeLine, gitStatusLine, historyBlock, hooksBlock,
  IDENTITY_BLOCK, memoryBlock, outputStyleLine, PRESSURE_DIRECTIVES, projectInstructionsBlock, REPORTING_BLOCK,
  SCOPE_BLOCK, searchPlaybook, sessionBlock, skillsBlock, suggestedSkillsBlock, TONE_BLOCK, toolRealities, toolsBlock, trustBlock,
  VERIFICATION_BLOCK,
} from "./prompts.ts";

/** Ceiling on the authored part of the static header (the instructions file not
 *  counted): every rule costs tokens on every request, so a new rule has to fit or
 *  replace an older one. Raised from 9 000 when the catalogue gained the tools of
 *  Orkeon #180 (their names alone take some 330 characters), then from 9 500 for the
 *  question-to-tool routing of code-intel-routing.ts: without it the model answered
 *  "every base class" with a shell script of regular expressions instead of the index, then
 *  from 10 500 for the rules the prompt audit of 2026-11-01 found missing: `edit_file`, the
 *  reads of a turn in one message, `grep` for an exact text outside the code. */
export const MAX_STATIC_HEADER_CHARS = 10_800;

/** What the session lets the turn deliver — chosen from the catalogue, so stable per mode. */
function describeSession(tools: readonly string[]): string {
  return sessionBlock(tools.includes("file_write"));
}

/** Where instructions come from, and how a request to remember is kept. The shared lessons tool, when the session
 *  offers it, is named as not the place for that fact: it files lessons for every session, not this user's note. */
function describeTrust(tools: readonly string[]): string {
  return trustBlock(tools.includes("memory_push"));
}

/** The tools that reach the web: the project's own sources come before them. */
const WEB_TOOLS: readonly string[] = ["web_search", ...NETWORK_READ_TOOLS];

/**
 * What the offered tools can and cannot do. Conditional on the catalogue, like the
 * search playbook: a read-only mode is not told how to write, and the line about the
 * shell appears only where the shell is offered. Stable per mode, so the cache holds.
 */
function describeToolRealities(tools: readonly string[]): string {
  return toolRealities({
    fileRead: tools.includes("file_read"),
    editFile: tools.includes("edit_file"),
    fileWrite: tools.includes("file_write"),
    shell: tools.includes("shell_command"),
    web: WEB_TOOLS.some((tool) => tools.includes(tool)),
  });
}

/**
 * The search playbook — static per mode, so it sits above the cache boundary.
 *
 * Without it the model has a tool list and no policy: it reaches for shell grep
 * because grep is familiar, paying a process spawn per probe and reading stale
 * text the index has already parsed. The playbook states the order of preference
 * and the one fact the model cannot guess: results are already fresh — the tools
 * reindex edited files before answering, so it must never spend a call on
 * index_codebase again "just in case". The last resort depends on the catalogue:
 * the shell where it is offered, a plain read where it is not.
 */
function describeSearchPlaybook(tools: readonly string[]): string {
  return searchPlaybook({
    searchRouting: describeSearchRouting(tools),
    codeIntelRouting: describeCodeIntelRouting(tools),
    shell: tools.includes("shell_command"),
    ragIngest: tools.includes("rag_ingest"),
  });
}

/**
 * Static header — the turn's SYSTEM prompt. MUST be byte-stable across turns
 * for a given mode: the behaviour rules, the sorted tool names with what those
 * tools can do, the search playbook when it applies, and the project's
 * instructions file verbatim (block omitted entirely when absent). Never put
 * numbers-of-the-day in here — as the absolute prefix of every request it is the
 * cache anchor, and (being a real system message) it carries system-level
 * authority over anything user-side, tool results included.
 */
export function buildStaticHeader(opts: {
  toolNames: readonly string[];
  /** The script tools of the session (`memory_recall`, `memory_push`): offered apart from the catalogue, so not
   *  listed under Tools, but the rules that name one read them. Stable per mode, as the catalogue is. */
  scriptTools?: readonly string[];
  instructions?: InstructionsFile;
}): string {
  // Sorted so a differently-ordered catalogue still yields the same bytes.
  const tools = [...opts.toolNames].sort();
  const parts = [
    IDENTITY_BLOCK, describeSession(tools), REPORTING_BLOCK, TONE_BLOCK, SCOPE_BLOCK,
    FINISHING_BLOCK, ASKING_BLOCK, VERIFICATION_BLOCK, CARE_BLOCK, describeTrust([...tools, ...(opts.scriptTools ?? [])]),
  ];
  if (tools.length > 0) {
    parts.push(toolsBlock(tools, describeToolRealities(tools)));
  }
  // The playbook only makes sense when the search tools are actually granted
  // (plan/dontAsk keep them; a hypothetical catalogue without codebase_search
  // must not advertise it).
  if (tools.includes("codebase_search")) {
    parts.push(describeSearchPlaybook(tools));
  }
  const instructions = opts.instructions;
  if (instructions !== undefined && instructions.content.trim().length > 0) {
    parts.push(projectInstructionsBlock(instructions.file, instructions.content.trim()));
  }
  return parts.join("\n\n");
}

/** Memory block — fixed category order, empty categories omitted, capped. */
export function buildMemoryBlock(byCategory: Partial<Record<string, string[]>>): string {
  const sections: string[] = [];
  for (const category of MEMORY_CATEGORIES) {
    const entries = (byCategory[category] ?? []).filter((e) => e.trim().length > 0);
    if (entries.length === 0) continue;
    const capped = entries.slice(0, MAX_MEMORY_ENTRIES_PER_CATEGORY);
    sections.push(`### ${category}\n` + capped.map((e) => `- ${e}`).join("\n"));
  }
  return sections.length === 0 ? "" : memoryBlock(sections.join("\n"));
}

/** Volatile environment block (cwd, date, git status) — always below the cache boundary. */
export function buildUserContextBlock(c: { cwd: string; date?: string; gitStatus?: string }): string {
  const lines = [`## Environment`, `cwd: ${c.cwd}`];
  if (c.date !== undefined && c.date.trim().length > 0) lines.push(`date: ${c.date.trim()}`);
  if (c.gitStatus !== undefined && c.gitStatus.trim().length > 0) {
    lines.push(gitStatusLine(c.gitStatus.trimEnd()));
  }
  return lines.join("\n");
}

/** Keep the LAST `max` requests and answers (sliding window), with the marked messages ([tools], [turn-context],
 *  [compacted]) that sit between them and those just before the oldest one kept (its [turn-context], the summary of
 *  the compacted turns): a turn that called a tool takes as much of the window as one that did not.
 *  NB: the default is resolved in the body, NOT as a default parameter —
 *  `max = HISTORY_WINDOW` in the signature trips a Jint NRE when the bundled
 *  call resumes from an await (identifier lookup in default-param position). */
export function windowHistory(messages: SessionMsg[], max?: number): SessionMsg[] {
  const limit = max ?? HISTORY_WINDOW;
  if (limit <= 0) return [];
  let counted = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (!countsInWindow(messages[i])) continue;
    counted += 1;
    if (counted === limit) {
      let start = i;
      while (start > 0 && isMarkedMessage(String(messages[start - 1].content ?? ""))) start -= 1;
      return messages.slice(start);
    }
  }
  return messages;
}

/** A request or an answer: what the window counts. */
function countsInWindow(m: SessionMsg): boolean {
  return (m.role === "user" || m.role === "assistant") && !isMarkedMessage(String(m.content ?? ""));
}

/**
 * The buffer without the request being answered.
 *
 * The loop appends the user's message before it assembles the prompt, so the
 * buffer ends with the very request the task block carries: rendered as is, every
 * turn would send it twice. Only that trailing entry goes; an earlier identical
 * request is history.
 */
export function withoutCurrentRequest(messages: SessionMsg[], request: string): SessionMsg[] {
  const last = messages[messages.length - 1];
  const isRequest = last !== undefined && last.role === "user" && String(last.content).trim() === request.trim();
  return isRequest ? messages.slice(0, -1) : messages;
}

/** Render the windowed history as a transcript block ("" when empty). The
 *  compaction boundary is bookkeeping for the host (counting compactions), left
 *  out: the summary message that follows it says what it stands for. */
export function buildHistoryBlock(messages: SessionMsg[]): string {
  const shown = messages.filter((m) => !isCompactBoundary(m));
  if (shown.length === 0) return "";
  return historyBlock(shown.map((m) => `${m.role}: ${m.content}`).join("\n"));
}

// ── Session preferences and registries ──────────────────────────────────
//
// Every block below is VOLATILE and therefore below the cache boundary: a session
// preference in the static header would break the provider's prefix cache on the
// first /output-style, which is the one property the header's tests defend.

/**
 * Session preferences as a `<system-reminder>` — output style and language.
 *
 * `<system-reminder>` marks the text as coming from the environment rather than
 * from the user: a preference the operator set with /output-style or
 * `answer.language` is not part of the request being answered.
 *
 * Returns "" for the default style with no language, so an unconfigured
 * session's prompt carries no preference block at all.
 */
export function buildPreferencesBlock(p: { outputStyle?: string; language?: string }): string {
  const lines: string[] = [];
  const style = isOutputStyle(p.outputStyle) ? String(p.outputStyle) : "default";
  if (style !== "default") {
    lines.push(outputStyleLine(style));
  }
  const language = String(p.language ?? "").trim();
  if (language.length > 0) {
    lines.push(answerLanguageLine(language));
  }
  if (lines.length === 0) return "";
  return "<system-reminder>\n" + lines.join("\n") + "\n</system-reminder>";
}

/**
 * Declared hooks — what is declared, and the fact that nothing runs it yet.
 *
 * `/hooks` stores declarations; the engine that would run them is missing (it
 * waits on the runtime). Telling the model a hook exists while it never runs would
 * make it reason about a guarantee it does not have, so the block states the status.
 */
export function buildHooksBlock(hooks: ReadonlyArray<{ event?: string; command?: string }>): string {
  const valid = (hooks ?? []).filter((h) => String(h?.event ?? "").length > 0);
  if (valid.length === 0) return "";
  const rows = valid.map((h) => `- ${h.event}: ${String(h.command ?? "").trim()}`);
  return hooksBlock(rows.join("\n"));
}

/**
 * Attached skills as PROMPT FRAGMENTS.
 *
 * Each entry is `{ path, content }` — the path alone would tell the model a
 * playbook exists without letting it read one, which is worse than silence.
 * Content is capped per skill so one long playbook cannot crowd out the task.
 */
export const MAX_SKILL_FRAGMENT_CHARS = 4_000;

/** The sections of the skills that have content, each under its path and capped. */
function skillSections(skills: ReadonlyArray<{ path: string; content: string }>): string {
  const usable = (skills ?? []).filter((s) => String(s?.content ?? "").trim().length > 0);
  return usable.map((s) => {
    const body = String(s.content).trim().slice(0, MAX_SKILL_FRAGMENT_CHARS);
    const truncated = String(s.content).trim().length > MAX_SKILL_FRAGMENT_CHARS;
    return `### ${s.path}\n${body}${truncated ? "\n… (truncated)" : ""}`;
  }).join("\n\n");
}

export function buildSkillsBlock(skills: ReadonlyArray<{ path: string; content: string }>): string {
  const sections = skillSections(skills);
  return sections.length === 0 ? "" : skillsBlock(sections);
}

/** The skills suggested for the turn, in a block of their own: not the operator's word (suggestedSkillsBlock). */
export function buildSuggestedSkillsBlock(skills: ReadonlyArray<{ path: string; content: string }>): string {
  const sections = skillSections(skills);
  return sections.length === 0 ? "" : suggestedSkillsBlock(sections);
}

/** Budget/cost gauge — a <system-reminder>, tail of the volatile zone, with the
 *  conduct the pressure tier calls for (the tiers of shared/domain/compaction-thresholds.ts). */
export function buildGaugeBlock(g: {
  usedTokens: number;
  contextWindow: number;
  costUsd: number;
  totalTokens: number;
  totalCalls: number;
}): string {
  const lines = [gaugeLine(g)];
  const tier = pressureTier(g.usedTokens, g.contextWindow);
  if (tier !== "ok") lines.push(PRESSURE_DIRECTIVES[tier]);
  return "<system-reminder>\n" + lines.join("\n") + "\n</system-reminder>";
}

/** The parts of a turn's context, in cache-safe order: the user message `act` sends before the request
 *  (`ActOptions.context`, Orkeon #276). The static header is NOT here: it travels as the system prompt
 *  (`ActOptions.system`). The request is not here either: it is the prompt, the last user message alone,
 *  the one a decision profile's guard and route stages judge. */
export interface ContextParts {
  /** Session preferences (<system-reminder>) — first, they shape the answer. */
  preferences?: string;
  /** Attached skill fragments — instructions the operator opted into. */
  skills?: string;
  memory?: string;
  /** Declared hooks, with their not-running status. */
  hooks?: string;
  userContext?: string;
  history?: string;
  gauge?: string;
}

/**
 * Join the context's parts in fixed order, skipping empty blocks.
 *
 * Order, and why: from the most stable to the most volatile, so a provider's prefix
 * cache reaches as far into the context as it can. Preferences and skills change only
 * when the operator acts and govern HOW the rest is answered; memory and hooks are
 * standing context; the history only grows between compactions; the environment
 * (date, git status) can change every turn; the gauge changes every turn. The request
 * follows in a message of its own, the place a model is least likely to lose and the
 * one a decision guard judges without the context diluting it. A session that sets
 * nothing renders none of the optional blocks.
 *
 * No block lists the MCP servers: the tools they serve already join the catalogue
 * (`tools.extra`), and a section announcing servers the model cannot address
 * directly would be noise.
 */
export function assembleContext(p: ContextParts): string {
  const blocks = [
    p.preferences, p.skills, p.memory, p.hooks,
    p.history, p.userContext, p.gauge,
  ];
  return blocks.filter((b): b is string => b !== undefined && b.length > 0).join("\n\n");
}
