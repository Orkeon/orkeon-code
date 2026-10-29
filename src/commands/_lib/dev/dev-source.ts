// The arguments of /dev-spec and of its alias /dev-change, read from the line the REPL hands over (quotes kept, so a
// --run command stays whole). A code first, then a kind (bug, refactor or perf: a change brief, run by the dev-change
// crew), a --run "<command>" after the kind and before the text, and the rest as one text: the brief, the origin or a
// revision request. Without a kind the line is a spec, run by the dev-spec crew, and --run is refused. Typed as
// /dev-change (the alias), the line keeps that command's shape: always the dev-change crew, the kind optional on a
// revision of a brief (the crew checks it).
import { commandLine, isOption, splitWords } from "../args.ts";
import { isCode } from "../../../shared/domain/dev/artefacts.ts";

export const DEV_SPEC_USAGE =
  'usage: /dev-spec <code> [bug | refactor | perf] [--run "<command>"] [<brief text> | <path>.md | <#issue> | <revision request>]';
export interface DevSpecArgs { code: string; request: string }
export interface DevChangeArgs { code: string; kind: string; run: string; text: string }
/** The crew the line runs, with its input: a spec without a kind, a change brief with one. */
export type DevSourceParse =
  | { ok: true; crew: "dev-spec"; args: DevSpecArgs }
  | { ok: true; crew: "dev-change"; args: DevChangeArgs }
  | { ok: false; text: string };

const MAX_CODE = 64;
const KINDS = new Set(["bug", "refactor", "perf"]);
/** The alias that keeps /dev-change's own shape. */
export const DEV_CHANGE_ALIAS = "dev-change";

/** Why --run needs a kind, said where it is refused. */
export const RUN_NEEDS_KIND =
  "--run goes with a kind: bug (the command that reproduces it) or perf (the command that measures it); a feature is a spec and runs nothing";

function codeOf(word: string | undefined): { ok: true; code: string } | { ok: false; text: string } {
  if (word === undefined || word.trim() === "") return { ok: false, text: DEV_SPEC_USAGE };
  if (word.length > MAX_CODE || !isCode(word)) return { ok: false, text: `'${word}' is not a code (letters, digits, '.', '_', '-')\n${DEV_SPEC_USAGE}` };
  return { ok: true, code: word };
}

/** The text after the word at `from`: what the person typed, as typed. */
const restOf = (line: string, words: ReturnType<typeof splitWords>, from: number): string =>
  from >= words.length ? "" : line.slice(from === 0 ? 0 : words[from - 1].end).trim();

/** The line after /dev-spec (or `typed`, the name the person typed: /dev-change keeps its own shape). */
export function parseDevSpecArgs(tokens: readonly string[], typed = "dev-spec"): DevSourceParse {
  const line = commandLine(tokens);
  const words = splitWords(line);
  const code = codeOf(words[0]?.text);
  if (!code.ok) return code;
  let at = 1;
  let kind = "";
  if (words[at] !== undefined && !words[at].quoted && KINDS.has(words[at].text)) { kind = words[at].text; at++; }
  let run = "";
  if (isOption(words[at])) {
    if (words[at].text !== "--run") return { ok: false, text: `unknown option ${words[at].text}\n${DEV_SPEC_USAGE}` };
    const value = words[at + 1];
    if (value === undefined || isOption(value) || value.text.trim() === "") return { ok: false, text: `--run needs the command, quoted\n${DEV_SPEC_USAGE}` };
    run = value.text.trim();
    at += 2;
  }
  if (words.slice(at).some((w) => !w.quoted && w.text === "--run")) {
    return { ok: false, text: `--run comes before the text\n${DEV_SPEC_USAGE}` };
  }
  const text = words.length === at + 1 && words[at].quoted ? words[at].text : restOf(line, words, at);
  if (kind === "" && typed !== DEV_CHANGE_ALIAS) {
    if (run !== "") return { ok: false, text: `${RUN_NEEDS_KIND}\n${DEV_SPEC_USAGE}` };
    return { ok: true, crew: "dev-spec", args: { code: code.code, request: text } };
  }
  return { ok: true, crew: "dev-change", args: { code: code.code, kind, run, text } };
}
