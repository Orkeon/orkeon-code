// What a dev status reads before it shows anything: the repository pack, the work
// folder and the warnings about the checkout (the context), then one work code's
// artefacts parsed (the code), or the list of codes the work folder holds. It reads
// files and directory listings and runs git; it writes nothing and creates nothing.
import type { Files, Shell, ShellResult } from "../ports.ts";
import type { ConfigStore } from "../config-store.ts";
import { findRepoPack } from "./find-repo-pack.ts";
import type { FoundPack } from "./find-repo-pack.ts";
import { entryExists, resolveWorkFolder } from "./resolve-work-folder.ts";
import type { WorkFolder } from "./resolve-work-folder.ts";
import { DEFAULT_WORK_FOLDER, DEV_WORK_DIR_CONFIG_KEY, pickWorkDirRequest } from "../../domain/dev/work-folder.ts";
import { classifyArtefact, compareBatchIds, isCode } from "../../domain/dev/artefacts.ts";
import type { ArtefactName } from "../../domain/dev/artefacts.ts";
import { parseBatchSheet, parseGlobalPlan } from "../../domain/dev/plan-format.ts";
import type { BatchSheet, FormatProblem, GlobalPlan } from "../../domain/dev/plan-format.ts";
import { parseVerdictFile } from "../../domain/dev/verdict-format.ts";
import type { VerdictFile } from "../../domain/dev/verdict-format.ts";
import { parseBatchesState } from "../../domain/dev/batches-state.ts";
import type { BatchesState } from "../../domain/dev/batches-state.ts";

export interface DevContextDeps {
  files: Pick<Files, "read" | "list">; shell: Pick<Shell, "run">; config: Pick<ConfigStore, "readValue">;
}
export interface DevContext { pack: FoundPack | null; work: WorkFolder; warnings: string[] }
export const ORKEON_IGNORE_PROBE = ".orkeon/config.json";
export const HARNESS_SETTINGS_LOCAL = "/workspace/.claude/settings.local.json";
export const HARNESS_TODO = "/workspace/todo";

const TODO_LIST_CAP = 200;
const TODO_SUBFOLDERS_PROBED = 20;
const CODE_LIST_CAP = 500;
const CODES_PROBED = 50;
/** A loose file of the work folder (README.md, notes.txt): never a code folder, so never probed. */
const FILE_LIKE = /\.(md|markdown|txt|json|jsonl|ya?ml|toml|sh|log|html?|csv|tsv)$/i;
const HARNESS_WORK_PREFIX = /^(pr|quality|release|docs-audit)-/;

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const firstLine = (e: unknown): string => messageOf(e).split("\n")[0];
const bare = (entry: string): string => entry.replace(/\/+$/, "");
const byName = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** "git check-ignore -- " + paths.join(" ") */
export function checkIgnoreCommand(paths: readonly string[]): string {
  return `git check-ignore -- ${paths.join(" ")}`;
}

async function readWorkDirSetting(config: Pick<ConfigStore, "readValue">, warnings: string[]): Promise<string | undefined> {
  try {
    return (await config.readValue(DEV_WORK_DIR_CONFIG_KEY)).value;
  } catch (e) {
    warnings.push(`${DEV_WORK_DIR_CONFIG_KEY} could not be read (${firstLine(e)}): the pack or the default decides`);
    return undefined;
  }
}

async function checkIgnored(shell: Pick<Shell, "run">, work: WorkFolder, warnings: string[]): Promise<void> {
  const paths = [ORKEON_IGNORE_PROBE];
  if (work.folder === DEFAULT_WORK_FOLDER && (work.request === null || work.outcome !== "applied")) {
    paths.push(`${DEFAULT_WORK_FOLDER}/`);
  }
  let result: ShellResult;
  try {
    result = await shell.run(checkIgnoreCommand(paths));
  } catch {
    return;
  }
  if (result.exitCode !== 0 && result.exitCode !== 1) return;
  const ignored = new Set(result.stdout.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== ""));
  for (const path of paths) {
    if (!ignored.has(path)) warnings.push(`${path} is not ignored by git: add it to .gitignore (Orkeon Code never edits it)`);
  }
}

/** The harness's HARNESS_WORK_DIR from .claude/settings.local.json env; undefined when unreadable or unset. */
async function harnessWorkDir(files: Pick<Files, "read">): Promise<string | undefined> {
  try {
    const parsed: unknown = JSON.parse(await files.read(HARNESS_SETTINGS_LOCAL));
    if (typeof parsed !== "object" || parsed === null) return undefined;
    const env = (parsed as { env?: unknown }).env;
    if (typeof env !== "object" || env === null) return undefined;
    const value = (env as Record<string, unknown>).HARNESS_WORK_DIR;
    return typeof value === "string" ? value : undefined;
  } catch {
    return undefined;
  }
}

async function listOrEmpty(files: Pick<Files, "list">, path: string, cap: number): Promise<string[]> {
  try {
    return await files.list(path, cap);
  } catch {
    return [];
  }
}

async function todoHoldsHarnessWork(files: Pick<Files, "list">): Promise<boolean> {
  const entries = (await listOrEmpty(files, HARNESS_TODO, TODO_LIST_CAP)).map(bare);
  if (entries.some((e) => HARNESS_WORK_PREFIX.test(e))) return true;
  for (const entry of entries.slice(0, TODO_SUBFOLDERS_PROBED)) {
    const inner = await listOrEmpty(files, `${HARNESS_TODO}/${entry}`, TODO_LIST_CAP);
    if (inner.some((name) => classifyArtefact(bare(name)) !== null)) return true;
  }
  return false;
}

export async function loadDevContext(deps: DevContextDeps): Promise<DevContext> {
  const lookup = await findRepoPack(deps.files);
  const warnings = [...lookup.warnings];
  const pack = lookup.found;

  const configValue = await readWorkDirSetting(deps.config, warnings);
  const request = pickWorkDirRequest(configValue, pack?.pack.layout.work);
  const work = await resolveWorkFolder(deps, request);
  if (work.note !== null) warnings.push(work.note);

  await checkIgnored(deps.shell, work, warnings);

  if (request === null) {
    const named = (await harnessWorkDir(deps.files))?.trim().replace(/^\.\//, "").replace(/\/+$/, "");
    if (named !== DEFAULT_WORK_FOLDER && (await todoHoldsHarnessWork(deps.files))) {
      warnings.push(
        "todo/ holds harness artefacts and nothing names workbench/: set layout.work: workbench in the pack, " +
          "or HARNESS_WORK_DIR=workbench in .claude/settings.local.json env (W-01)",
      );
    }
  }
  return { pack, work, warnings };
}

export interface CodeSheet { batch: string; name: string; sheet: BatchSheet }
export interface CodeVerdict { batch: string; name: string; file: VerdictFile }
export interface DevCode {
  code: string; shown: string;                 // "workbench/demo"
  spec: string | null; change: string | null;  // file names
  plan: { name: string; plan: GlobalPlan } | null;
  sheets: CodeSheet[]; verdicts: CodeVerdict[];
  state: { name: string; state: BatchesState } | null;
  warnings: string[];
}
export type DevCodeLookup =
  | { found: DevCode }
  | { found: null; reason: "absent" | "empty" | "unreachable"; codes: string[] };

function classifyAll(entries: readonly string[]): ArtefactName[] {
  const out: ArtefactName[] = [];
  for (const entry of [...entries].map(bare).sort()) {
    const a = classifyArtefact(entry);
    if (a) out.push(a);
  }
  return out;
}

const byBatch = (a: { batch: string; name: string }, b: { batch: string; name: string }): number =>
  compareBatchIds(a.batch, b.batch) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

export async function loadDevCode(deps: Pick<DevContextDeps, "files">, work: WorkFolder, code: string): Promise<DevCodeLookup> {
  if (work.vfsPath === null) return { found: null, reason: "unreachable", codes: [] };
  const folder = `${work.vfsPath}/${code}`;
  if (!(await entryExists(deps.files, folder))) {
    let codes: string[] = [];
    try {
      codes = (await listDevCodes(deps, work)).map((c) => c.code);
    } catch {
      codes = [];
    }
    return { found: null, reason: "absent", codes };
  }

  const artefacts = classifyAll(await listOrEmpty(deps.files, folder, CODE_LIST_CAP));
  const of = (kind: ArtefactName["kind"]): ArtefactName[] => artefacts.filter((a) => a.kind === kind);
  const plans = of("plan");
  const specs = of("spec");
  const changes = of("change");
  if (plans.length === 0 && specs.length === 0 && changes.length === 0) {
    return { found: null, reason: "empty", codes: [] };
  }

  const shown = `${work.folder}/${code}`;
  const warnings: string[] = [];
  const read = async (name: string): Promise<string | null> => {
    try {
      return await deps.files.read(`${folder}/${name}`);
    } catch (e) {
      warnings.push(`${shown}/${name} cannot be read (${firstLine(e)})`);
      return null;
    }
  };
  const report = (name: string, problems: readonly FormatProblem[]): void => {
    for (const p of problems) warnings.push(`${shown}/${name}:${p.line}: ${p.message}`);
  };

  let plan: DevCode["plan"] = null;
  if (plans.length > 0) {
    const chosen = plans.find((p) => p.prefix.toUpperCase() === code.toUpperCase()) ?? plans[0];
    if (plans.length > 1) {
      warnings.push(`several plans in ${shown}/: ${plans.map((p) => p.name).join(", ")}: ${chosen.name} is read`);
    }
    const text = await read(chosen.name);
    if (text !== null) {
      const parsed = parseGlobalPlan(text);
      report(chosen.name, parsed.problems);
      plan = { name: chosen.name, plan: parsed };
    }
  }

  const sheets: CodeSheet[] = [];
  for (const a of of("sheet")) {
    const text = await read(a.name);
    if (text === null) continue;
    const sheet = parseBatchSheet(text);
    report(a.name, sheet.problems);
    sheets.push({ batch: a.batch ?? "", name: a.name, sheet });
  }
  const verdicts: CodeVerdict[] = [];
  for (const a of of("verdict")) {
    const text = await read(a.name);
    if (text === null) continue;
    const file = parseVerdictFile(text);
    report(a.name, file.problems);
    verdicts.push({ batch: a.batch ?? "", name: a.name, file });
  }
  let state: DevCode["state"] = null;
  for (const a of of("batches-state")) {
    const text = await read(a.name);
    if (text === null) continue;
    state = { name: a.name, state: parseBatchesState(text) };
    break;
  }

  return {
    found: {
      code, shown,
      spec: specs[0]?.name ?? null, change: changes[0]?.name ?? null,
      plan, sheets: sheets.sort(byBatch), verdicts: verdicts.sort(byBatch), state, warnings,
    },
  };
}

export interface CodeSummary { code: string; spec: boolean; change: boolean; plan: boolean; sheets: number; verdicts: number }

/** The codes of the work folder; throws when the work folder itself cannot be listed. */
export async function listDevCodes(deps: Pick<DevContextDeps, "files">, work: WorkFolder): Promise<CodeSummary[]> {
  return (await probeDevCodes(deps, work)).codes;
}

/** listDevCodes, plus how many candidate folders the cap of CODES_PROBED left unprobed. */
export async function probeDevCodes(
  deps: Pick<DevContextDeps, "files">, work: WorkFolder,
): Promise<{ codes: CodeSummary[]; notProbed: number }> {
  if (work.vfsPath === null) return { codes: [], notProbed: 0 };
  const listed = await deps.files.list(work.vfsPath, CODE_LIST_CAP);
  const candidates = [...new Set(listed.filter((e) => e.endsWith("/") || !FILE_LIKE.test(e)).map(bare).filter(isCode))]
    .sort(byName);
  const out: CodeSummary[] = [];
  for (const entry of candidates.slice(0, CODES_PROBED)) {
    const kinds = classifyAll(await listOrEmpty(deps.files, `${work.vfsPath}/${entry}`, CODE_LIST_CAP)).map((a) => a.kind);
    const count = (k: ArtefactName["kind"]): number => kinds.filter((x) => x === k).length;
    const summary: CodeSummary = {
      code: entry, spec: count("spec") > 0, change: count("change") > 0, plan: count("plan") > 0,
      sheets: count("sheet"), verdicts: count("verdict"),
    };
    if (summary.spec || summary.change || summary.plan) out.push(summary);
  }
  return { codes: out, notProbed: Math.max(0, candidates.length - CODES_PROBED) };
}
