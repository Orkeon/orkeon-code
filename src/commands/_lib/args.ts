// Pure argument parsing for slash commands — no IO, unit-tested with node --test
// (tests live in ../../tests/, outside the "*.cmd.ts" scan). Extracted from
// memory.cmd.ts:12-37 and assistant.cmd.ts:9-13.

import { MEMORY_CATEGORIES } from "../../shared/domain/agent-policy/memory-categories.ts";

export type ParsedMemory =
  | { sub: "add"; category: string; content: string }
  | { sub: "delete"; id: number }
  | { sub: "get"; id: number }
  | { sub: "list"; category?: string };

function isCategory(token: string | undefined): boolean {
  return MEMORY_CATEGORIES.includes(String(token ?? "").toLowerCase() as any);
}

/** Parse `/memory <list|add|delete|get> …` tokens into a typed command. */
export function parseMemoryArgs(tokens: string[]): ParsedMemory {
  const sub = (tokens[0] ?? "list").toLowerCase();
  if (sub === "add") {
    const hasCat = isCategory(tokens[1]);
    const category = hasCat ? tokens[1].toLowerCase() : "user";
    const content = tokens.slice(hasCat ? 2 : 1).join(" ");
    return { sub: "add", category, content };
  }
  if (sub === "delete") return { sub: "delete", id: Number(tokens[1]) };
  if (sub === "get") return { sub: "get", id: Number(tokens[1]) };
  // list (default)
  return { sub: "list", category: isCategory(tokens[1]) ? tokens[1].toLowerCase() : undefined };
}

/** Permission modes accepted as a leading `mode: …` prefix on /assistant. */
export { PERMISSION_MODES, isPermissionMode } from "../../shared/domain/permission-modes.ts";
import { PERMISSION_MODES as MODES } from "../../shared/domain/permission-modes.ts";

// Derived from the canonical list so a new mode (e.g. dontAsk, E-3) is
// automatically accepted as a prefix — no second hardcoded mode list.
const MODE_PREFIX_RE = new RegExp(`^(${MODES.join("|")})\\s*:\\s*(.*)$`, "s");

/** Parse `/assistant [mode:] <request>` into { prompt, permissionMode }.
 *  permissionMode is null when NO prefix was given — the crew then falls back
 *  to the session default set by /mode (an explicit `default:` prefix still
 *  pins the mode and bypasses the session default). */
export function parseAssistantInput(raw: string): { prompt: string; permissionMode: string | null } {
  const trimmed = raw.trim();
  const m = trimmed.match(MODE_PREFIX_RE);
  if (m) return { permissionMode: m[1], prompt: m[2] };
  return { permissionMode: null, prompt: trimmed };
}

/** Join a command's raw tokens back into a single trimmed string. */
export function rawText(args: any): string {
  return ((args?.raw ?? []) as string[]).join(" ").trim();
}

/** `/compact [--snip [N] | <focus>]`: the snip-only path with how many exchanges to
 *  keep (3 by default), or the focus of the summary. */
export function parseCompactArgs(tokens: readonly string[]): { snip: number } | { focus: string } {
  if (tokens[0] === "--snip") {
    const n = Number(tokens[1]);
    return { snip: Number.isInteger(n) && n > 0 ? n : 3 };
  }
  return { focus: tokens.join(" ").trim() };
}

/** The name the person typed the command by, read off the line the host hands over (`ctx.command.rawInput`):
 *  `/dev-verify F2 cache` → `dev-verify`, an alias as typed. `fallback` when the line names none. */
export function typedCommand(rawInput: unknown, fallback: string): string {
  return /^\s*\/?([a-z][a-z0-9-]*)(?:\s|$)/.exec(String(rawInput ?? ""))?.[1] ?? fallback;
}

/** A command's raw tokens as a string array. */
export function rawTokens(args: any): string[] {
  return (args?.raw ?? []) as string[];
}

/**
 * The raw tokens the REPL hands a command, as one line. The REPL splits the line on
 * spaces and keeps the quotes; a token that holds another blank (a tab) is quoted
 * again, so `splitWords` keeps it whole.
 */
export function commandLine(tokens: readonly string[]): string {
  return tokens.map((t) => (/\s/.test(t) && !t.includes('"') ? `"${t}"` : t)).join(" ");
}

/** A word of a command line: its text, whether it was quoted, and the offset where it ends in the line. */
export interface Word {
  text: string;
  quoted: boolean;
  end: number;
}

/**
 * Split a line on blanks. A quote that opens a word ("..." or '...') runs to the same
 * quote followed by a blank or the end of the line, and is dropped; a quote with no
 * such close, or inside a word (qu'il, l'API), is a letter (the '90s).
 */
export function splitWords(line: string): Word[] {
  const words: Word[] = [];
  let i = 0;
  while (i < line.length) {
    while (i < line.length && /\s/.test(line[i])) i++;
    if (i >= line.length) break;
    const quote = line[i];
    if (quote === '"' || quote === "'") {
      let close = i + 1;
      while (close < line.length && !(line[close] === quote && (close + 1 === line.length || /\s/.test(line[close + 1])))) close++;
      if (close < line.length) {
        words.push({ text: line.slice(i + 1, close), quoted: true, end: close + 1 });
        i = close + 1;
        continue;
      }
    }
    let end = i;
    while (end < line.length && !/\s/.test(line[end])) end++;
    words.push({ text: line.slice(i, end), quoted: false, end });
    i = end;
  }
  return words;
}

/** Whether a word is an option: it starts with `--` and is not quoted ("--stop", quoted, is a text). */
export function isOption(word: Word | undefined): boolean {
  return word !== undefined && !word.quoted && word.text.startsWith("--");
}

/** The value an option takes: the next word, unless it is missing, blank or another option. */
export function optionValue(words: readonly Word[], at: number): string | null {
  const value = words[at + 1];
  return value === undefined || isOption(value) || value.text.trim().length === 0 ? null : value.text.trim();
}

// ── B-12: /debug-tool-call ────────────────────────────────────────────────

export type ParsedToolCall =
  | { ok: true; tool: string; args: Record<string, unknown> }
  | { ok: false; reason: string };

/**
 * Parse `/debug-tool-call <tool_name> [json]` — the tool name, then an optional
 * JSON object of arguments.
 *
 * The JSON is re-joined from the raw tokens rather than taken as one: the REPL
 * splits on whitespace, so `{"path": "/a"}` arrives as two tokens and a naive
 * `tokens[1]` would silently parse `{"path":` and fail with a confusing message.
 *
 * A malformed payload is REFUSED, not coerced. This command exists to reproduce a
 * tool call faithfully; guessing at the caller's intent would defeat its only
 * purpose, and an empty object would look like a successful no-arg call.
 */
export function parseToolCallArgs(tokens: string[]): ParsedToolCall {
  const tool = String(tokens?.[0] ?? "").trim();
  if (tool.length === 0) {
    return { ok: false, reason: "usage: /debug-tool-call <tool_name> [{\"arg\": \"value\"}]" };
  }
  if (!/^[a-z][a-z0-9_]*$/i.test(tool)) {
    return { ok: false, reason: `'${tool}' is not a tool name (expected snake_case, e.g. file_read)` };
  }

  const payload = tokens.slice(1).join(" ").trim();
  if (payload.length === 0) return { ok: true, tool, args: {} };

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch (e: any) {
    return { ok: false, reason: `arguments are not valid JSON (${String(e?.message ?? e)}): ${payload}` };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, reason: `arguments must be a JSON OBJECT, got ${Array.isArray(parsed) ? "an array" : typeof parsed}` };
  }
  return { ok: true, tool, args: parsed as Record<string, unknown> };
}
