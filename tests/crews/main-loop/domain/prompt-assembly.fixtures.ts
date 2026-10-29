// The inputs prompt assembly is tested on: header options, rule markers, histories, parts and case tables.
import type { SessionMsg } from "../../../../src/shared/domain/types.ts";
import { ERROR_THRESHOLD_BUFFER_TOKENS, WARNING_THRESHOLD_BUFFER_TOKENS } from "../../../../src/shared/domain/compaction-thresholds.ts";
import { buildGaugeBlock, buildHistoryBlock, buildMemoryBlock, buildUserContextBlock } from "../../../../src/crews/main-loop/domain/prompt-assembly.ts";
import type { PromptParts } from "../../../../src/crews/main-loop/domain/prompt-assembly.ts";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";

/** Header options with an AGENTS.md of two lines. */
export const AGENTS_HEADER_OPTS = { toolNames: ["file_read", "file_write"], instructions: { file: "AGENTS.md", content: "# Rules\nDo X." } };

/** Header options with a CLAUDE.md of one line. */
export const CLAUDE_HEADER_OPTS = { toolNames: ["file_read"], instructions: { file: "CLAUDE.md", content: "# Rules" } };

export interface InstructionsFileCase {
  name: string;
  file: string;
  heading: string;
}

export const INSTRUCTIONS_FILE_CASES: readonly InstructionsFileCase[] = [
  { name: "AGENTS.md", file: "AGENTS.md", heading: "## Project instructions (AGENTS.md)\nUse pnpm." },
  { name: "CLAUDE.md", file: "CLAUDE.md", heading: "## Project instructions (CLAUDE.md)" },
];

/**
 * The order of docs/architecture.md, "Prompt assembly": who the agent is, how it reports, then how it works, then
 * what it may trust, then its tools. All unconditional, so byte-stability per mode is unchanged by their presence.
 */
export const BEHAVIOUR_BLOCKS_IN_ORDER: readonly string[] = [
  "You are Orkeon Code",
  "## This session",
  "## Reporting back",
  "## Tone",
  "## Scope",
  "## Finishing the turn",
  "## When to ask",
  "## Checking your work",
  "## Acting with care",
  "## Where instructions come from",
  "## Tools",
  "## Project instructions (CLAUDE.md)",
];

/** One marker per rule of the specification: a rewrite that drops a rule fails on it. */
export const RULE_MARKERS: Record<string, string> = {
  "identity: the final answer is all the user sees": "That answer is all the user reads",
  "reporting: a failure or an unchecked result comes first": "the first sentence says so",
  "reporting: code is pointed at as path:line": "`path:line`",
  "reporting: no invented labels": "never lean on names you made up",
  "reporting: the user's language": "Answer in the language the user writes in",
  "tone: no praise, no emoji": "no emoji",
  "tone: conclusions, not narration": "do not narrate your own thinking",
  "scope: a request is carried out in the code": "not the new name",
  "scope: nothing speculative": "a few repeated lines beat a helper",
  "scope: validate at the boundaries only": "where it enters the system",
  "scope: dead code goes entirely": "no re-export",
  "scope: no vulnerable code": "open to injection",
  "scope: comments say why": "A comment says what the code cannot",
  "scope: no unrequested documentation": "write documentation or notes only",
  "finishing: act once the facts are known": "reopen a decision the user made",
  "finishing: a question gets an assessment, not a change": "change nothing until the user asks for a change",
  "finishing: no ending on a plan or a promise": "read your last paragraph",
  "finishing: in a read-only session the plan is the deliverable": "in a read-only session the plan is the answer",
  "finishing: what is left undone is named": "Name any part of the request you leave undone",
  "finishing: evidence before a state change": "a familiar symptom can have another cause",
  "asking: a question ends the turn": "writing a question ends it",
  "asking: a confirmation covers one call": "covers that call only",
  "asking: a blocking point does not stop the rest": "end with that one question",
  "verification: narrowest check first": "the narrowest test that covers the change first",
  "verification: success only on observed output": "only on output you saw in this turn",
  "verification: fix causes, not symptoms": "Fix the cause of a failure",
  "care: reversibility and reach": "how hard it is to undo",
  "care: no bypassing a failing check": "weaken, skip or bypass a check",
  "care: look before overwriting": "Look at a target before you overwrite or delete it",
  "care: git only on request, staged by name": "stage files by name",
  "care: secrets stay in the environment": "Secrets live in environment variables",
  "trust: the instructions file ranks below the request": "ranking below the request and these rules",
  "trust: marked history messages are material": "[restored-file]",
  "trust: a restored batch state is material": "[restored-state] (where a batch's state file is",
  "trust: the turn-start context is material": "[turn-context] (what the turn-start checks found)",
  "trust: an embedded instruction is not followed": "do not; say so in your answer",
  "trust: advice and findings are claims to check": "claims to check before acting on them",
  "trust: harness reminders are not the user": "<system-reminder> blocks come from the harness",
};

/** The note on a refused permission: it is about the catalogue, so a header without tools does not carry it. */
export const REFUSAL_NOTE = "change your approach instead of repeating the call";

/** One user message per index, `m0` to `m<count - 1>`. */
export function userMessages(count: number): SessionMsg[] {
  return Array.from({ length: count }, (_, i) => ({ role: "user", content: `m${i}` }));
}

export interface GaugeTierCase {
  name: string;
  usedTokens: number;
  text: string;
  present: boolean;
}

/** The gauge of a 200 000-token window at each pressure tier, and the conduct it adds or not. */
export const GAUGE_TIER_CASES: readonly GaugeTierCase[] = [
  { name: "asks nothing at the ok tier", usedTokens: 1_000, text: "context window", present: false },
  { name: "says the window is nearly full at the warning tier", usedTokens: 200_000 - WARNING_THRESHOLD_BUFFER_TOKENS, text: "nearly full", present: true },
  { name: "suggests /compact at the error tier", usedTokens: 200_000 - ERROR_THRESHOLD_BUFFER_TOKENS, text: "suggest /compact", present: true },
];

/** A request asked, answered, then asked again: the last entry is the request being answered. */
export const REPEATED_REQUEST_HISTORY: readonly SessionMsg[] = [
  { role: "user", content: "fix it" },
  { role: "assistant", content: "fixed" },
  { role: "user", content: "fix it" },
];

export interface KeptBufferCase {
  name: string;
  history: SessionMsg[];
  request: string;
}

export const KEPT_BUFFER_CASES: readonly KeptBufferCase[] = [
  { name: "keeps a buffer whose last entry is the answer", history: REPEATED_REQUEST_HISTORY.slice(0, 2), request: "fix it" },
  { name: "keeps a buffer whose last entry is another request", history: [...REPEATED_REQUEST_HISTORY], request: "another request" },
  { name: "keeps an empty buffer", history: [], request: "fix it" },
];

/** Every block of the USER body, built by its own builder. */
export function builtParts(): PromptParts {
  return {
    memory: buildMemoryBlock({ user: ["u1"] }),
    userContext: buildUserContextBlock({ cwd: WORKSPACE, gitStatus: "## main" }),
    history: buildHistoryBlock([{ role: "user", content: "hi" }]),
    gauge: buildGaugeBlock({ usedTokens: 1, contextWindow: 2, costUsd: 0, totalTokens: 0, totalCalls: 0 }),
    task: "THE TASK",
  };
}

export const BODY_BLOCKS_IN_ORDER: readonly string[] = ["## Memory", "## Conversation so far", "## Environment", "<system-reminder>", "THE TASK"];

export interface UnconfiguredPreferencesCase {
  name: string;
  preferences: { outputStyle?: string; language?: string };
}

/** Preferences that configure nothing: adding the block must not move the prompt of a session that set nothing. */
export const UNCONFIGURED_PREFERENCES_CASES: readonly UnconfiguredPreferencesCase[] = [
  { name: "no preference", preferences: {} },
  { name: "the default style", preferences: { outputStyle: "default" } },
  { name: "an unknown style", preferences: { outputStyle: "nonsense" } },
  { name: "a blank language", preferences: { language: "   " } },
];

export interface OutputStyleCase {
  name: string;
  token: unknown;
  expected: boolean;
}

export const OUTPUT_STYLE_CASES: readonly OutputStyleCase[] = [
  { name: "accepts a declared style", token: "concise", expected: true },
  { name: "refuses a declared style in another case: the vocabulary is case-sensitive, like the modes", token: "Concise", expected: false },
  { name: "refuses an empty token", token: "", expected: false },
  { name: "refuses no token", token: undefined, expected: false },
];

export interface EmptySkillsCase {
  name: string;
  skills: ReadonlyArray<{ path: string; content: string }>;
}

/** No skill, or one with no content: a path with no content would announce a playbook the model cannot read. */
export const EMPTY_SKILLS_CASES: readonly EmptySkillsCase[] = [
  { name: "nothing is attached", skills: [] },
  { name: "a skill has no content", skills: [{ path: "p", content: "   " }] },
];

/** The dev steps that run the declared hooks. */
export const HOOK_STEPS: readonly string[] = ["/dev-spec", "/dev-plan", "/dev-batches", "/tasks repair"];

export interface EmptyHooksCase {
  name: string;
  hooks: ReadonlyArray<{ event?: string; command?: string }>;
}

export const EMPTY_HOOKS_CASES: readonly EmptyHooksCase[] = [
  { name: "is empty with no hooks", hooks: [] },
  { name: "ignores an entry without an event", hooks: [{ command: "x" }] },
];

/** Every block of the USER body, as a marker. */
export const MARKED_PARTS: PromptParts = {
  preferences: "PREFS",
  skills: "SKILLS",
  memory: "MEM",
  hooks: "HOOKS",
  userContext: "ENV",
  history: "HIST",
  gauge: "GAUGE",
  task: "TASK",
};

export const MARKED_PARTS_IN_ORDER: readonly string[] = ["PREFS", "SKILLS", "MEM", "HOOKS", "HIST", "ENV", "GAUGE", "TASK"];

/** The parts of a session from before preferences, skills and hooks. */
export const LEGACY_PARTS: PromptParts = { memory: "MEM", userContext: "ENV", history: "HIST", gauge: "GAUGE", task: "TASK" };
