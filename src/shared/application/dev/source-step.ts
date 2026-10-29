// What /dev-spec and dev-change share before and after their own draft: the inputs' code, the checkout check,
// the code's folder under the work folder, a request given as a path read whole, the self-check of a written
// source against the parser /dev-plan uses, and the end-message pieces. No model call here.
import type { Files, Shell } from "../ports.ts";
import { GIT_TOPLEVEL } from "./resolve-work-folder.ts";
import type { WorkFolder } from "./resolve-work-folder.ts";
import { isCode } from "../../domain/dev/artefacts.ts";
import { parseDecisions } from "../../domain/dev/questions.ts";
import type { Decision, Question } from "../../domain/dev/questions.ts";
import { parsePlanSource } from "../../domain/dev/spec-format.ts";
import type { SourceKind } from "../../domain/dev/spec-format.ts";
import { WORKSPACE } from "../../domain/vfs.ts";

export const MAX_CODE_CHARS = 64;
export const MAX_REQUEST_CHARS = 20_000;
const MAX_WARNINGS = 5;
const MAX_PROBLEM_LINES = 12;
const LIST_CAP = 1000;
const PATH_TOKEN = /^[A-Za-z0-9._\-/]+\.(md|txt)$/;

export const firstLine = (e: unknown): string => (e instanceof Error ? e.message : String(e)).split("\n")[0];
const pad2 = (n: number): string => String(n).padStart(2, "0");
/** A write of the source file that failed: the one failure the step reports as "could not be written"; any other
 *  (a question cancelled, a model call that failed) goes up as it is. */
export class SourceWriteFailure extends Error {
  constructor(cause: unknown) {
    super(firstLine(cause));
  }
}

/** The write of a source file, its failure a SourceWriteFailure. */
export const sourceWriter = (files: Pick<Files, "write">, vfs: string) => async (text: string): Promise<void> => {
  try {
    await files.write(vfs, text);
  } catch (e) {
    throw new SourceWriteFailure(e);
  }
};

export const dateOf = (d: Date): string => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

export function warningLines(warnings: readonly string[]): string[] {
  const lines = warnings.slice(0, MAX_WARNINGS).map((w) => `warning: ${w}`);
  if (warnings.length > MAX_WARNINGS) lines.push(`  … ${warnings.length - MAX_WARNINGS} more warnings`);
  return lines;
}

export function problemLines(problems: readonly string[]): string[] {
  const lines = problems.slice(0, MAX_PROBLEM_LINES).map((p) => `  ${p}`);
  if (problems.length > MAX_PROBLEM_LINES) lines.push(`  … ${problems.length - MAX_PROBLEM_LINES} more`);
  return lines;
}

/** The code of the inputs, or the refusal. */
export function inputCode(step: string, value: unknown): string | { refused: string } {
  if (typeof value !== "string" || value.length > MAX_CODE_CHARS || !isCode(value)) return { refused: `${step}: invalid crew input: code` };
  return value;
}

/** A free text input: "" when absent, the refusal when it is not a string or too long. */
export function inputText(step: string, name: string, value: unknown): string | { refused: string } {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string" || value.length > MAX_REQUEST_CHARS) return { refused: `${step}: invalid crew input: ${name}` };
  return value.trim();
}

export async function toplevelRefusal(step: string, shell: Pick<Shell, "run">): Promise<string | null> {
  let top: string;
  try {
    const r = await shell.run(GIT_TOPLEVEL);
    top = r.exitCode === 0 ? r.stdout.trim() : "";
  } catch {
    top = "";
  }
  if (top === WORKSPACE) return null;
  return `${step}: run from the checkout at ${WORKSPACE} (git reports ${top === "" ? "no work tree" : top})`;
}

export interface CodeFolder {
  /** "/workspace/workbench/prune". */
  vfs: string;
  /** "workbench/prune". */
  shown: string;
  names: string[];
  file: (name: string) => { vfs: string; shown: string };
}

/** The code's folder under the work folder and the names it holds ([] when it does not exist yet). */
export async function codeFolder(step: string, files: Pick<Files, "list">, work: WorkFolder, code: string): Promise<CodeFolder | { refused: string }> {
  if (work.vfsPath === null) {
    return { refused: `${step}: the work folder ${work.folder} is outside the checkout's mounts: run from the main worktree` };
  }
  const vfs = `${work.vfsPath}/${code}`;
  const shown = `${work.folder}/${code}`;
  let names: string[];
  try {
    names = (await files.list(vfs, LIST_CAP)).map((n) => n.replace(/\/+$/, ""));
  } catch {
    names = [];
  }
  return { vfs, shown, names, file: (name) => ({ vfs: `${vfs}/${name}`, shown: `${shown}/${name}` }) };
}

/**
 * A request given as one token naming a .md or .txt file of the checkout is read whole; anything else is the text
 * itself. A path out of the checkout is refused.
 */
export async function readRequest(step: string, files: Pick<Files, "read">, request: string): Promise<{ text: string; from: string } | { refused: string }> {
  if (!PATH_TOKEN.test(request)) return { text: request, from: "" };
  const relative = request.startsWith(`${WORKSPACE}/`) ? request.slice(WORKSPACE.length + 1) : request.replace(/^\.\//, "");
  if (relative.startsWith("/") || relative.split("/").includes("..")) {
    return { refused: `${step}: ${request} is outside the checkout: give a path under ${WORKSPACE}` };
  }
  try {
    const text = await files.read(`${WORKSPACE}/${relative}`, MAX_REQUEST_CHARS);
    if (text.trim() === "") return { refused: `${step}: ${relative} is empty` };
    return { text, from: relative };
  } catch (e) {
    return { refused: `${step}: ${relative} cannot be read (${firstLine(e)})` };
  }
}

/**
 * The written file read back by /dev-plan's parser: the title's code, every id the answer gave, as many open
 * questions and decisions as rendered, no format problem. [] when the file reads as written.
 */
export function sourceSelfCheck(
  text: string, kind: SourceKind, expect: { code: string; ids: readonly string[]; open: readonly Question[]; decisions: readonly Decision[] },
): string[] {
  const parsed = parsePlanSource(text, kind);
  const problems = parsed.problems.map((p) => `line ${p.line}: ${p.message}`);
  if (parsed.code !== expect.code) problems.push(`the title does not read the code ${expect.code}`);
  const read = parsed.ids.map((i) => i.id).join(",");
  if (read !== expect.ids.join(",")) {
    problems.push(`the ids read back are ${read || "none"}, not ${expect.ids.join(",")}`);
  }
  if (parsed.openQuestions.length !== expect.open.length) {
    problems.push(`${parsed.openQuestions.length} open questions read back, ${expect.open.length} written`);
  }
  if (parseDecisions(text).length !== expect.decisions.length) problems.push("the decisions do not read back");
  return problems;
}

/** "2 Blocking, 1 Major" for the open questions, "none" when there is none. */
export function openLine(open: readonly Question[]): string {
  if (open.length === 0) return "none";
  const blocking = open.filter((q) => q.severity === "Blocking").length;
  return `${blocking} Blocking, ${open.length - blocking} Major (${open.map((q) => q.id).join(", ")})`;
}
