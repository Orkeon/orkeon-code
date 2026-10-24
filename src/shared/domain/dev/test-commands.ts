// The narrow test commands a validation (run_validation) or a run_tests call may run: one runs
// only when it is exactly one of the pack's narrow test commands, each placeholder filled with
// one plain relative value and nothing appended - never the whole suite, never a build, never an
// option or a shell operator. Pure.
import type { RepoPackCommands } from "./repo-pack.ts";

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
  if (value.split("/").includes("..")) return `the value '${value}' holds a '..' segment`;
  if (!PLAIN_VALUE.test(value)) return `the value '${value}' is not one plain relative name`;
  return null;
}

type Key = "commands.test_class" | "commands.test_project" | "commands.test_integration";

export function checkValidation(command: string, commands: RepoPackCommands): ValidationCheck {
  const c = command.trim();
  const refuse = (reason: string): ValidationCheck => ({ ok: false, command: c, reason });
  if (c === "" || /[\r\n]/.test(c) || c.length > MAX_COMMAND_CHARS) return refuse("not one line of at most 400 characters");
  if (!plainWords(c)) return refuse("a shell operator outside double quotes");

  const templates: Array<[Key, string | undefined]> = [
    ["commands.test_class", commands.testClass],
    ["commands.test_project", commands.testProject],
    ["commands.test_integration", commands.testIntegration],
  ];
  if (templates.every(([, t]) => t === undefined || t.trim() === "")) {
    return refuse("the pack has no test_class, test_project or test_integration");
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
    if (suffixed) problem ??= `nothing may follow the pack's command: '${suffixed[suffixed.length - 1]}'`;
  }
  if (problem !== null) return refuse(problem);
  return refuse(bareIntegration
    ? "test_integration without a filter is a whole suite"
    : "not one of the pack's test_class, test_project or test_integration commands");
}

function scopeOf(values: readonly string[]): string {
  const named = values.join(", ");
  return named === "" ? "as the pack names it" : named;
}

/** `\`<command>\` — exit <n>, scope <scope>, <count> tests` (SK:72); count "not counted" when unknown. */
export function validationLine(command: string, exit: number, scope: string, tests: number | null): string {
  return `\`${command}\` — exit ${exit}, scope ${scope}, ${tests === null ? "not counted" : tests} tests`;
}
