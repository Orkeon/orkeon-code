// Prompt assembly for the main-loop act() turn (FINALIZE-PLAN F4) — pure, no IO.
// Assembles a SYSTEM/USER pair:
// the byte-stable static header (identity + tools + CLAUDE.md) is the SYSTEM
// prompt (`ActOptions.system` → a real `role:"system"` message — until that
// option existed the header travelled inside the user message with user-level
// authority), and the volatile blocks (memory, git status, history, budget
// gauge, the task itself) are the USER body, in a fixed order chosen for
// DeepSeek disk-cache stability: the system prompt is the absolute request
// prefix, so it must be byte-identical turn after turn — no timestamps, no
// counters, no gauges; everything volatile goes in the user body, tail-most last.
//
// Run tests: node_modules/.bin/tsx --test crews/main-loop/domain/prompt-assembly.test.ts

import type { SessionMsg } from "../../../shared/domain/types.ts";
import { MEMORY_CATEGORIES } from "../../../shared/domain/agent-policy/memory-categories.ts";
import { isOutputStyle } from "../../../shared/domain/agent-policy/output-styles.ts";

/** Sliding window over the session history (the structural excess is F3's job). */
export const HISTORY_WINDOW = 50;

/** Cap per memory category in the prompt block. */
export const MAX_MEMORY_ENTRIES_PER_CATEGORY = 10;

import { describeSearchRouting } from "../../../shared/domain/search-routing.ts";

const IDENTITY_BLOCK =
  "You are an interactive coding agent operating inside an Orkeon crew. " +
  "You explore, edit and run code in /workspace through tool calls, under a permission mode. " +
  "Work step by step: inspect before you modify, prefer small verifiable changes, " +
  "and answer with a concise summary of what you did.";

// ── Behaviour blocks adapted from the public Claude Code corpus ────────────
// (claude-code-system-prompts/, Piebald extraction). Orkeon Code replicated the
// MECHANICS of the original (tools, permissions, compaction) but its prompt
// carried only identity + tool policy — everything about HOW to behave was
// missing. These blocks are the highest-leverage subset, condensed and adapted
// to Orkeon Code's reality (single final answer per act() turn, catalogue-based
// permissions). All static, digit-free (the header's no-digit pin guards the
// cache prefix), and unconditional so the header stays byte-stable per mode.

/** Corpus: outcome-first communication style + code references. */
const COMMUNICATION_BLOCK =
  "## Communicating with the user\n" +
  "Your text output is what the user reads; they cannot see your tool calls or " +
  "their raw results. Everything the user needs from a turn — answers, findings, " +
  "conclusions — must be in your final message. Lead with the outcome: the first " +
  "sentence answers \"what happened\" or \"what did you find\"; supporting detail " +
  "comes after.\n" +
  "Readable beats concise. Keep output short by dropping details that do not " +
  "change what the reader does next — not by compressing into fragments, " +
  "abbreviations or arrow chains. Write complete sentences, spell out technical " +
  "terms, and never make the reader cross-reference labels you invented earlier.\n" +
  "Match the response to the question: a simple question gets a direct answer in " +
  "prose, not headers and sections. Reference code as `file_path:line_number` so " +
  "the user can jump to it.\n" +
  "When listing files or directories, render them as a tree grouped by folder, " +
  "using the usual box-drawing connectors — `├──` and `└──` under a parent, `│` " +
  "for continuation, directory names ending with `/` — never as a flat bullet " +
  "list of paths.";

/** Corpus: doing-tasks family + comment why-only guidance. */
const DOING_TASKS_BLOCK =
  "## Doing tasks\n" +
  "Requests are software-engineering tasks: fix bugs, add functionality, " +
  "refactor, explain code. Interpret generic instructions in that context — " +
  "asked to rename a method, change the code, do not just reply with the new name.\n" +
  "- Do not add features, abstractions or refactors beyond what the task " +
  "requires, and do not design for hypothetical future needs. A few similar " +
  "lines beat a premature abstraction. No half-finished implementations.\n" +
  "- Do not add error handling, fallbacks or validation for scenarios that " +
  "cannot happen. Trust internal code and framework guarantees; validate only " +
  "at system boundaries (user input, external APIs).\n" +
  "- No backwards-compatibility hacks: if something is certainly unused, delete " +
  "it completely — no renamed leftover vars, no re-exports, no \"removed\" comments.\n" +
  "- Do not introduce vulnerabilities (command injection, XSS, SQL injection and " +
  "the like); if you notice you wrote insecure code, fix it immediately.\n" +
  "- Code comments: default to none. Add one only when the WHY is non-obvious — " +
  "a hidden constraint, a subtle invariant, a workaround. Never explain WHAT " +
  "the code does, and never reference the current task or fix in a comment.";

/** Corpus: act-when-ready + autonomous-operation guidelines (turn discipline). */
const TURN_DISCIPLINE_BLOCK =
  "## Completing the turn\n" +
  "When you have enough information to act, act: do not re-derive facts already " +
  "established in the conversation, re-litigate a decision the user already " +
  "made, or narrate options you will not pursue. When weighing a choice, give a " +
  "recommendation, not an exhaustive survey.\n" +
  "When the user describes a problem or asks a question without requesting a " +
  "change, the deliverable is your assessment: report your findings and stop — " +
  "do not apply a fix until they ask for one.\n" +
  "Before ending your turn, check your last paragraph: if it is a plan, a " +
  "question you could answer yourself, or a promise about work you have not " +
  "done, do that work now with tool calls. End the turn only when the task is " +
  "complete or you are blocked on input only the user can provide.\n" +
  "Before running a command that changes state, check that the evidence " +
  "actually supports that specific action — a signal that pattern-matches a " +
  "known failure may have a different cause.";

/** Corpus: harness instructions — how a permission refusal must be read. */
const PERMISSION_NOTE =
  "Tools run behind a permission mode; a tool missing from this list or a call " +
  "that comes back refused means the mode or the user declined it — adjust your " +
  "approach, do not retry the same call verbatim.";

/**
 * The search playbook (PLAN C3) — static, so it sits ABOVE the cache boundary.
 *
 * Without it the model has a tool list and no policy: it reaches for shell grep
 * because grep is familiar, paying a process spawn per probe and reading stale
 * text the index has already parsed. The playbook states the order of preference
 * and the one fact the model cannot guess: results are ALREADY fresh — the tools
 * reindex edited files before answering, so it must never burn a turn calling
 * index_codebase again "just in case".
 */
const SEARCH_PLAYBOOK_BLOCK =
  "## How to search\n" +
  "Route by FILE TYPE — the two indexes cover disjoint ground, and querying the " +
  "wrong one returns a guaranteed-empty answer that reads as \"not found\":\n" +
  describeSearchRouting() + "\n" +
  "- `codebase_search` is hybrid vector+BM25: exact identifiers AND paraphrases both " +
  "work (`match_origin` on each hit says why it ranked); read definitions with " +
  "`symbol_source(fqn)`, callers/callees with `flow_trace` (Forward|Backward|Both). " +
  "`rag_search`'s parameter is `question`.\n" +
  "- Structure and dependencies in ONE call, not one flow_trace per symbol: " +
  "`dependency_graph` (scope L1_Package|L2_Module|L3_Symbol), `impact_analysis(target)` " +
  "for who breaks if a symbol changes, `package_summary(fqn)`, `symbol_detail(fqn)`, " +
  "`sub_graph(seeds)`.\n" +
  "- Shell `grep` is the LAST resort, for content neither index covers.\n" +
  "- Code results are automatically fresh: edited files are reindexed before a search " +
  "answers (`refreshed_files` on the response says when that happened). Do not " +
  "re-run `index_codebase` after edits. Freshness does NOT extend to ingested " +
  "documents — re-run `rag_ingest` after editing a doc you need to re-search.";

/**
 * Static header — the turn's SYSTEM prompt. MUST be byte-stable across turns
 * for a given mode: identity, sorted tool names, and the project's CLAUDE.md
 * verbatim (block omitted entirely when absent). Never put numbers-of-the-day
 * in here — as the absolute prefix of every request it is the cache anchor,
 * and (being a real system message now) it carries system-level authority
 * over anything user-side, tool results included.
 */
export function buildStaticHeader(opts: { toolNames: readonly string[]; claudeMd?: string }): string {
  const parts = [IDENTITY_BLOCK, COMMUNICATION_BLOCK, DOING_TASKS_BLOCK, TURN_DISCIPLINE_BLOCK];
  // Sorted so a differently-ordered catalogue still yields the same bytes.
  const tools = [...opts.toolNames].sort();
  if (tools.length > 0) {
    parts.push("## Tools\n" + tools.join(", ") + "\n" + PERMISSION_NOTE);
  }
  // The playbook only makes sense when the search tools are actually granted
  // (plan/dontAsk keep them; a hypothetical catalogue without codebase_search
  // must not advertise it).
  if (tools.includes("codebase_search")) {
    parts.push(SEARCH_PLAYBOOK_BLOCK);
  }
  if (opts.claudeMd !== undefined && opts.claudeMd.trim().length > 0) {
    parts.push("## Project instructions (CLAUDE.md)\n" + opts.claudeMd.trim());
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
  return sections.length === 0 ? "" : "## Memory\n" + sections.join("\n");
}

/** Volatile environment block (cwd, git status) — always below the cache boundary. */
export function buildUserContextBlock(c: { cwd: string; gitStatus?: string }): string {
  const lines = [`## Environment`, `cwd: ${c.cwd}`];
  if (c.gitStatus !== undefined && c.gitStatus.trim().length > 0) {
    lines.push("git status:\n" + c.gitStatus.trimEnd());
  }
  return lines.join("\n");
}

/** Keep the LAST `max` messages (sliding window).
 *  NB: the default is resolved in the body, NOT as a default parameter —
 *  `max = HISTORY_WINDOW` in the signature trips a Jint NRE when the bundled
 *  call resumes from an await (identifier lookup in default-param position). */
export function windowHistory(messages: SessionMsg[], max?: number): SessionMsg[] {
  const limit = max ?? HISTORY_WINDOW;
  return messages.length <= limit ? messages : messages.slice(messages.length - limit);
}

/** Render the windowed history as a transcript block ("" when empty). */
export function buildHistoryBlock(messages: SessionMsg[]): string {
  if (messages.length === 0) return "";
  return "## Conversation so far\n" + messages.map((m) => `${m.role}: ${m.content}`).join("\n");
}

// ── B-7: session-preference and registry blocks (baseline 09 §2 inventory) ──
//
// Orkeon Code replicated the ORDER and the byte-stability of the original's inventory
// but shipped a thin subset: identity/tools/CLAUDE.md above the boundary, then
// memory, environment, history, gauge, task. The original additionally carries
// output-style, language, hooks and MCP sections below the boundary, and uses
// `<system-reminder>` for more than the budget gauge.
//
// Every block added here is VOLATILE and therefore below the cache boundary —
// putting a session preference in the static header would break the DeepSeek
// prefix cache on the first /output-style, which is the one property the header's
// test exists to defend.

/** How each declared style (agent-policy/output-styles.ts) instructs the model.
 *  Rendered verbatim, so a style IS its text. */
const OUTPUT_STYLE_DIRECTIVES: Record<string, string> = {
  default: "Answer with a concise summary of what you did.",
  concise: "Answer in as few words as the result allows. No preamble, no recap of the request.",
  explanatory: "Explain your reasoning as you go: why this approach, what you ruled out, what to watch.",
  learning: "Teach while you work: name the concepts involved and point at where to read more.",
};

/**
 * Session preferences as a `<system-reminder>` — output style and language.
 *
 * `<system-reminder>` because that is what the original uses for harness-injected
 * directives (baseline 09 §2), and because it marks the text as coming from the
 * environment rather than from the user: a preference the operator set with
 * /output-style is not part of the request being answered.
 *
 * Returns "" for the default style with no language override, so an unconfigured
 * session's prompt is byte-identical to the pre-B-7 one.
 */
export function buildPreferencesBlock(p: { outputStyle?: string; language?: string }): string {
  const lines: string[] = [];
  const style = isOutputStyle(p.outputStyle) ? String(p.outputStyle) : "default";
  if (style !== "default") {
    lines.push(`Output style: ${style}. ${OUTPUT_STYLE_DIRECTIVES[style]}`);
  }
  const language = String(p.language ?? "").trim();
  if (language.length > 0) {
    lines.push(`Answer in ${language} unless the user writes in another language.`);
  }
  if (lines.length === 0) return "";
  return "<system-reminder>\n" + lines.join("\n") + "\n</system-reminder>";
}

/**
 * Declared hooks — what WILL fire, and the fact that nothing fires yet.
 *
 * The registry ships (E-1) and the engine does not (E-8, blocked on framework
 * G-6). Telling the model a hook exists while it never runs would make the model
 * reason about a guarantee it does not have, so the block states the status.
 */
export function buildHooksBlock(hooks: ReadonlyArray<{ event?: string; command?: string }>): string {
  const valid = (hooks ?? []).filter((h) => String(h?.event ?? "").length > 0);
  if (valid.length === 0) return "";
  const rows = valid.map((h) => `- ${h.event}: ${String(h.command ?? "").trim()}`);
  return (
    "## Declared hooks\n" + rows.join("\n") +
    "\nNOTE: the execution engine is not wired yet (E-8 / framework G-6) — these are declared, not firing."
  );
}

/**
 * B-13: attached skills as PROMPT FRAGMENTS.
 *
 * `/skills` persisted a registry that nothing consumed: attaching a playbook
 * changed no prompt and no behaviour, and the only thing it affected was the
 * post-compaction file restore (E-4), by accident, because the paths happened to
 * be mentioned in the transcript.
 *
 * Each entry is `{ path, content }` — the path alone would tell the model a
 * playbook exists without letting it read one, which is worse than silence.
 * Content is capped per skill so one long playbook cannot crowd out the task.
 */
export const MAX_SKILL_FRAGMENT_CHARS = 4_000;

export function buildSkillsBlock(skills: ReadonlyArray<{ path: string; content: string }>): string {
  const usable = (skills ?? []).filter((s) => String(s?.content ?? "").trim().length > 0);
  if (usable.length === 0) return "";
  const sections = usable.map((s) => {
    const body = String(s.content).trim().slice(0, MAX_SKILL_FRAGMENT_CHARS);
    const truncated = String(s.content).trim().length > MAX_SKILL_FRAGMENT_CHARS;
    return `### ${s.path}\n${body}${truncated ? "\n… (truncated)" : ""}`;
  });
  return "## Attached skills\n" + sections.join("\n\n");
}

/** Budget/cost gauge — a <system-reminder>, tail of the volatile zone (09 §6). */
export function buildGaugeBlock(g: {
  usedTokens: number;
  contextWindow: number;
  costUsd: number;
  totalTokens: number;
  totalCalls: number;
}): string {
  return (
    "<system-reminder>\n" +
    `Token budget: ${g.usedTokens}/${g.contextWindow} used. ` +
    `Session cost: $${g.costUsd} (${g.totalTokens} tokens, ${g.totalCalls} calls).\n` +
    "</system-reminder>"
  );
}

/** The USER body's parts, in cache-safe order. The static header is NOT here:
 *  it travels as the system prompt (`ActOptions.system`), not as a user block. */
export interface PromptParts {
  /** B-7: session preferences (<system-reminder>) — first, they shape the answer. */
  preferences?: string;
  /** B-13: attached skill fragments — instructions the operator opted into. */
  skills?: string;
  memory?: string;
  /** B-7: declared hooks, with their not-firing status. */
  hooks?: string;
  userContext?: string;
  history?: string;
  gauge?: string;
  /** The user's request + permission note — always LAST. */
  task: string;
}

/**
 * Join the user body's parts in fixed order, skipping empty optional blocks.
 *
 * Order, and why: preferences and skills come first because they govern HOW the
 * rest is answered; memory and hooks are standing context; environment and
 * history are the volatile situation; the gauge stays tail-most before the
 * task, which is always last (09 §6). An unconfigured session omits every new
 * block, so its body is byte-identical to the pre-B-7 one.
 *
 * MCP is deliberately absent from this inventory though baseline 09 §2 lists it:
 * MCP is a declared non-goal of this prompt (# TBD_mcp), and an empty section announcing a
 * capability that does not exist is worse than its absence.
 */
export function assemblePrompt(p: PromptParts): string {
  const blocks = [
    p.preferences, p.skills, p.memory, p.hooks,
    p.userContext, p.history, p.gauge,
    p.task,
  ];
  return blocks.filter((b): b is string => b !== undefined && b.length > 0).join("\n\n");
}
