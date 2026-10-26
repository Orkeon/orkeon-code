// The arguments of /dev-spec and /dev-change, read from the line the REPL hands over (quotes kept, so a --run
// command stays whole). A code first, then for /dev-change a kind (optional on a revision, the crew checks it),
// a --run "<command>" after the kind and before the text, and the rest as one text: the brief, the origin or a revision request.
import { commandLine, isOption, splitWords } from "../args.ts";
import { isCode } from "../../../shared/domain/dev/artefacts.ts";

export const DEV_SPEC_USAGE = "usage: /dev-spec <code> [<brief text> | <path>.md | <revision request>]";
export const DEV_CHANGE_USAGE = 'usage: /dev-change <code> [bug | refactor | perf] [--run "<command>"] [<#issue | path | text>]';
export interface DevSpecArgs { code: string; request: string }
export interface DevChangeArgs { code: string; kind: string; run: string; text: string }
type Parse<T> = { ok: true; args: T } | { ok: false; text: string };

const MAX_CODE = 64;
const KINDS = new Set(["bug", "refactor", "perf"]);

function codeOf(word: string | undefined, usage: string): Parse<string> {
  if (word === undefined || word.trim() === "") return { ok: false, text: usage };
  if (word.length > MAX_CODE || !isCode(word)) return { ok: false, text: `'${word}' is not a code (letters, digits, '.', '_', '-')\n${usage}` };
  return { ok: true, args: word };
}

/** The text after the word at `from`: what the person typed, as typed. */
const restOf = (line: string, words: ReturnType<typeof splitWords>, from: number): string =>
  from >= words.length ? "" : line.slice(from === 0 ? 0 : words[from - 1].end).trim();

export function parseDevSpecArgs(tokens: readonly string[]): Parse<DevSpecArgs> {
  const line = commandLine(tokens);
  const words = splitWords(line);
  const code = codeOf(words[0]?.text, DEV_SPEC_USAGE);
  if (!code.ok) return code;
  if (isOption(words[1])) return { ok: false, text: `unknown option ${words[1].text}\n${DEV_SPEC_USAGE}` };
  const request = words.length === 2 && words[1].quoted ? words[1].text : restOf(line, words, 1);
  return { ok: true, args: { code: code.args, request } };
}

export function parseDevChangeArgs(tokens: readonly string[]): Parse<DevChangeArgs> {
  const line = commandLine(tokens);
  const words = splitWords(line);
  const code = codeOf(words[0]?.text, DEV_CHANGE_USAGE);
  if (!code.ok) return code;
  let at = 1;
  let kind = "";
  if (words[at] !== undefined && !words[at].quoted && KINDS.has(words[at].text)) { kind = words[at].text; at++; }
  let run = "";
  if (isOption(words[at])) {
    if (words[at].text !== "--run") return { ok: false, text: `unknown option ${words[at].text}\n${DEV_CHANGE_USAGE}` };
    const value = words[at + 1];
    if (value === undefined || isOption(value) || value.text.trim() === "") return { ok: false, text: `--run needs the command, quoted\n${DEV_CHANGE_USAGE}` };
    run = value.text.trim();
    at += 2;
  }
  if (words.slice(at).some((w) => !w.quoted && w.text === "--run")) {
    return { ok: false, text: `--run comes before the origin\n${DEV_CHANGE_USAGE}` };
  }
  const text = words.length === at + 1 && words[at].quoted ? words[at].text : restOf(line, words, at);
  return { ok: true, args: { code: code.args, kind, run, text } };
}
