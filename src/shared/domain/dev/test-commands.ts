// The narrow test commands a validation (run_validation) or a run_tests call may run: one runs
// only when it is exactly one of the pack's narrow test commands, each placeholder filled with
// one plain relative value and nothing appended - never the whole suite, never a build, never an
// option or a shell operator. Pure.
import type { RepoPackCommands } from "./repo-pack.ts";
import {
  AS_THE_PACK_NAMES_IT, INTEGRATION_WITHOUT_FILTER, NOT_A_PACK_TEST_COMMAND, NOT_ONE_LINE, nothingMayFollow,
  PACK_HAS_NO_TEST_COMMAND, SHELL_OPERATOR_OUTSIDE_QUOTES, validationLineText, valueHoldsDotDot, valueNotPlain,
} from "./messages.ts";

export type ValidationCheck =
  | { ok: true; command: string; key: "commands.test_class" | "commands.test_project" | "commands.test_integration"; scope: string }
  | { ok: false; command: string; reason: string };

const MAX_COMMAND_CHARS = 400;
export const PLACEHOLDER = /<[^<>]+>/g;
const ANY_WORD = "(\\S+)";
/** One placeholder value: a plain relative name, no leading "-", no "~", no glob, no quote. */
const PLAIN_VALUE = /^[A-Za-z0-9_][A-Za-z0-9_.:/-]*$/;
const OUTSIDE_FORBIDDEN = new Set([...";&|<>$`\\()'"]);
const INSIDE_FORBIDDEN = new Set([..."`$\\"]);

/** True when the text holds no shell operator outside double quotes and no expansion inside them. */
export function plainWords(text: string): boolean {
  let quoted = false;
  for (const c of text) {
    if (c === '"') { quoted = !quoted; continue; }
    if (quoted ? INSIDE_FORBIDDEN.has(c) : OUTSIDE_FORBIDDEN.has(c)) return false;
  }
  return !quoted;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function templateSource(template: string): string {
  return template.split(PLACEHOLDER).map(escapeRegExp).join(ANY_WORD);
}

/** Why a placeholder value is refused, or null when it is one plain relative value. */
export function valueProblem(value: string): string | null {
  if (value.split("/").includes("..")) return valueHoldsDotDot(value);
  if (!PLAIN_VALUE.test(value)) return valueNotPlain(value);
  return null;
}

type Key = "commands.test_class" | "commands.test_project" | "commands.test_integration";

export function checkValidation(command: string, commands: RepoPackCommands): ValidationCheck {
  const c = command.trim();
  const refuse = (reason: string): ValidationCheck => ({ ok: false, command: c, reason });
  if (c === "" || /[\r\n]/.test(c) || c.length > MAX_COMMAND_CHARS) return refuse(NOT_ONE_LINE);
  if (!plainWords(c)) return refuse(SHELL_OPERATOR_OUTSIDE_QUOTES);

  const templates: Array<[Key, string | undefined]> = [
    ["commands.test_class", commands.testClass],
    ["commands.test_project", commands.testProject],
    ["commands.test_integration", commands.testIntegration],
  ];
  if (templates.every(([, t]) => t === undefined || t.trim() === "")) {
    return refuse(PACK_HAS_NO_TEST_COMMAND);
  }
  let bareIntegration = false;
  let problem: string | null = null;
  for (const [key, template] of templates) {
    if (template === undefined || template.trim() === "") continue;
    const source = templateSource(template.trim());
    const whole = new RegExp(`^${source}$`).exec(c);
    if (whole) {
      const values = whole.slice(1);
      if (key === "commands.test_integration" && values.length === 0) { bareIntegration = true; continue; }
      const bad = values.map(valueProblem).find((p) => p !== null) ?? null;
      if (bad !== null) { problem ??= bad; continue; }
      return { ok: true, command: c, key, scope: scopeOf(values) };
    }
    const suffixed = new RegExp(`^${source} (.+)$`).exec(c);
    if (suffixed) problem ??= nothingMayFollow(suffixed[suffixed.length - 1]);
  }
  if (problem !== null) return refuse(problem);
  return refuse(bareIntegration
    ? INTEGRATION_WITHOUT_FILTER
    : NOT_A_PACK_TEST_COMMAND);
}

function scopeOf(values: readonly string[]): string {
  const named = values.join(", ");
  return named === "" ? AS_THE_PACK_NAMES_IT : named;
}

/** `\`<command>\` — exit <n>, scope <scope>, <count> tests` (SK:72); count "not counted" when unknown. */
export function validationLine(command: string, exit: number, scope: string, tests: number | null): string {
  return validationLineText(command, exit, scope, tests === null ? "not counted" : tests);
}
