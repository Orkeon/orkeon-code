// The capture of a batch whose gate is green: one file per section under
// <planDir>/capture-<F>/ - status, changed files and their diffs, build, cost, traits,
// the last test run, the test classes - then the mechanical table and the index. Each
// file stays readable whole by the auditor. A section the shell cannot produce says so;
// only a failed write stops the capture.
import type { Files, Shell } from "../../../shared/application/ports.ts";
import { firstLine, stdoutLines } from "../domain/text.ts";
import { runtimeCut } from "../domain/runtime-cut.ts";
import { COST_NOT_COMPUTED, costSection } from "../../../shared/domain/dev/access-cost.ts";
import type { DevVerifyTarget, GateRun } from "./run-gate.ts";
import { WORKSPACE } from "./run-gate.ts";
import type { BuildState, TableRow } from "../domain/mechanical-table.ts";
import { CHECK_METHODS, mechanicalRows, renderTable } from "../domain/mechanical-table.ts";
import {
  MAX_CLASS_FILES, MAX_DIFF_FILES, TEST_TAIL_LINES, buildFailure, buildLogProblem, classesIn, diffBase, isTestFile,
  isTestRoot, splitSection, tailLines, testClassesLine, testRunSummary, traitsSection, typeNameOf,
} from "../domain/capture-sections.ts";
import type { TestRunSummary } from "../domain/capture-sections.ts";
import {
  UNQUOTABLE_SCOPE, findNewer, gitDiffTracked, gitDiffUntracked, gitMethodGrep, gitStatusShort, gitTestFilesNaming,
} from "../domain/commands.ts";

export const BUILD_TIMEOUT_SECONDS = 900;

export interface Capture {
  folder: string;            // VFS "/workspace/<planDir>/capture-<F>"
  folderShown: string;       // "<planDir>/capture-<F>"
  files: string[];           // VFS paths written, index.txt first, table.md last
  rows: TableRow[];
  table: string;             // table.md content
  build: BuildState;
  testRoots: string[];
}

type Deps = { files: Pick<Files, "read" | "write" | "list">; shell: Pick<Shell, "run"> };

const SOURCE_FILE = /\.(cs|ts|py|fs|vb)$/;
const TEST_FILES_SHOWN = 5;

function errorLine(error: unknown): string {
  return firstLine(error instanceof Error ? error.message : String(error));
}

function notCaptured(command: string, error: unknown): string {
  return `not captured: '${command}' failed (${errorLine(error)})`;
}


function lineCount(text: string): number {
  if (text === "") return 0;
  const n = text.split("\n").length;
  return text.endsWith("\n") ? n - 1 : n;
}

function text(lines: readonly string[]): string {
  return `${lines.join("\n")}\n`;
}

function basename(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** The capture's writer: every file of a section, and what the index lists. */
class Writer {
  readonly written: Array<{ name: string; chars: number; path: string }> = [];
  private readonly files: Pick<Files, "write">;
  private readonly folder: string;
  constructor(files: Pick<Files, "write">, folder: string) {
    this.files = files;
    this.folder = folder;
  }

  async section(base: string, content: string): Promise<void> {
    for (const part of splitSection(base, content)) await this.file(part.name, part.content);
  }

  async file(name: string, content: string): Promise<void> {
    const path = `${this.folder}/${name}`;
    await this.files.write(path, content);
    this.written.push({ name, chars: content.length, path });
  }
}

async function readOrNull(files: Pick<Files, "read">, path: string): Promise<string | null> {
  try {
    return await files.read(path);
  } catch {
    return null;
  }
}

interface DiffEntry { path: string; line: string; base?: string; content?: string }

/** One entry per changed file outside `<planDir>/`: the capture, the verdict and the logs live there. */
async function diffs(deps: Deps, target: DevVerifyTarget, gate: GateRun): Promise<DiffEntry[]> {
  const entries: DiffEntry[] = [];
  const changed = gate.changedFiles.filter((f) => !f.startsWith(`${target.planDirShown}/`));
  for (const [i, path] of changed.entries()) {
    if (i >= MAX_DIFF_FILES) { entries.push({ path, line: `${path} → no diff captured (beyond the first ${MAX_DIFF_FILES} files)` }); continue; }
    const command = gate.untrackedFiles.includes(path) ? gitDiffUntracked(path) : gitDiffTracked(path);
    if (command === null) { entries.push({ path, line: `${path} → no diff captured (a quote in the path)` }); continue; }
    let raw: string;
    try {
      raw = (await deps.shell.run(command)).stdout;
    } catch (error) {
      entries.push({ path, line: `${path} → no diff captured ('${command}' failed (${errorLine(error)}))` });
      continue;
    }
    const { kept: stdout, omitted } = runtimeCut(raw);
    const base = diffBase(i + 1);
    const lines = lineCount(stdout);
    const doubt = omitted > 0 ? ` (cut by the runtime, ${omitted} characters omitted)` : "";
    entries.push({
      path, base,
      line: `${path} → ${base}.txt (${lines} lines)${doubt}`,
      content: `# diff ${path} (${lines} lines)\n${stdout}`,
    });
  }
  return entries;
}

async function reuseProblem(deps: Deps, target: DevVerifyTarget, gate: GateRun, logShown: string): Promise<string | null> {
  const log = await readOrNull(deps.files, `${WORKSPACE}/${logShown}`);
  if (log === null || log === "") return `log missing or empty: ${logShown}`;
  if (buildLogProblem(log) !== null) return "the log holds an error";
  const paths = gate.changedFiles.filter((f) => !f.startsWith(`${target.planDirShown}/`));
  if (paths.length === 0) return null;
  const command = findNewer(paths, logShown);
  if (command === null) return "the shell cannot compare dates: more than 200 files, or a path the shell cannot quote";
  let newer: string[];
  try {
    newer = stdoutLines((await deps.shell.run(command)).stdout);
  } catch (error) {
    return `the shell cannot compare dates: ${errorLine(error)}`;
  }
  return newer.length === 0 ? null : `changed after it:${newer.map((p) => ` ${p.replace(/^\.\//, "")}`).join("")}`;
}

async function buildSection(deps: Deps, target: DevVerifyTarget, gate: GateRun): Promise<{ content: string; state: BuildState }> {
  const build = target.pack?.commands.build;
  if (build === undefined || build.trim() === "") {
    return { content: text(["not run — the pack has no commands.build"]), state: { state: "none" } };
  }
  const logShown = `${target.planDirShown}/logs/${target.batch}-build.txt`;
  const why = await reuseProblem(deps, target, gate, logShown);
  if (why === null) {
    return {
      content: text([`command: ${build}`, `exit: 0 (reused ${logShown}: ends green, no changed file newer — one build per batch)`]),
      state: { state: "reused", log: logShown },
    };
  }
  const head = [`log not reused (${why}): built again`, `command: ${build}`];
  try {
    const result = await deps.shell.run(build, { timeoutSeconds: BUILD_TIMEOUT_SECONDS });
    if (result.timedOut === true) {
      return {
        content: text([...head, `exit: none — timed out after ${BUILD_TIMEOUT_SECONDS} s`]),
        state: { state: "timeout", seconds: BUILD_TIMEOUT_SECONDS },
      };
    }
    if (result.exitCode === 0) return { content: text([...head, "exit: 0"]), state: { state: "run", exit: 0, why: "" } };
    const output = result.stdout !== "" && !result.stdout.endsWith("\n") && result.stderr !== ""
      ? `${result.stdout}\n${result.stderr}` : `${result.stdout}${result.stderr}`;
    const failure = buildFailure(output);
    return {
      content: text([...head, `exit: ${result.exitCode}`, ...failure.lines]),
      state: { state: "run", exit: result.exitCode, why: failure.why },
    };
  } catch (error) {
    const message = errorLine(error);
    return { content: text([...head, `not run — the shell refused it: ${message}`]), state: { state: "refused", message } };
  }
}

async function testTail(deps: Deps, target: DevVerifyTarget): Promise<{ content: string; log: { name: string; summary: TestRunSummary } | null }> {
  const logs = `${target.planDirShown}/logs`;
  const candidates = [`${logs}/${target.batch}-test-affected.txt`, `${logs}/${target.batch}-test.txt`];
  let empty: string | null = null;
  for (const shown of candidates) {
    const content = await readOrNull(deps.files, `${WORKSPACE}/${shown}`);
    if (content === null) continue;
    if (content.trim() === "") { empty ??= shown; continue; }
    const tail = tailLines(content, TEST_TAIL_LINES);
    return { content: text([`file: ${shown}`, ...tail]), log: { name: basename(shown), summary: testRunSummary(tail) } };
  }
  if (empty !== null) return { content: text([`missing or empty: ${empty}`]), log: null };
  return { content: text([`no test log: neither ${candidates[0]} nor ${candidates[1]}`]), log: null };
}

async function testClasses(deps: Deps, target: DevVerifyTarget, gate: GateRun, testRoots: readonly string[]): Promise<string> {
  const out: string[] = [];
  let counted = 0;
  for (const path of gate.changedFiles) {
    if (!SOURCE_FILE.test(path) || path.startsWith(`${target.planDirShown}/`)) continue;
    const test = isTestFile(path, testRoots);
    const source = await readOrNull(deps.files, `${WORKSPACE}/${path}`);
    if (source === null) continue;
    if (test) {
      out.push(testClassesLine(path, classesIn(source), null));
    } else if (testRoots.length === 0) {
      out.push(testClassesLine(path, null, null, "no test root given"));
    } else {
      const ext = path.slice(path.lastIndexOf(".") + 1);
      const command = gitTestFilesNaming(typeNameOf(path), testRoots, ext, gate.excludes);
      if (command === null) {
        out.push(testClassesLine(path, null, null, "not searched (the name is not a plain word)"));
      } else {
        try {
          out.push(testClassesLine(path, null, stdoutLines((await deps.shell.run(command)).stdout).slice(0, TEST_FILES_SHOWN)));
        } catch (error) {
          out.push(notCaptured(command, error));
        }
      }
    }
    counted++;
    if (counted >= MAX_CLASS_FILES) { out.push(`[cut at ${MAX_CLASS_FILES} files]`); break; }
  }
  if (counted === 0) out.push("no changed source file");
  return text(out);
}

async function methodHits(
  deps: Deps, gate: GateRun, testRoots: readonly string[],
): Promise<{ hits: string[] | null; failure: string | null }> {
  if (gate.facts.methods.length === 0 || testRoots.length === 0) return { hits: null, failure: null };
  const command = gitMethodGrep(gate.facts.methods, testRoots, gate.excludes);
  if (command === null) return { hits: null, failure: UNQUOTABLE_SCOPE };
  try {
    return { hits: stdoutLines((await deps.shell.run(command)).stdout), failure: null };
  } catch (error) {
    return { hits: null, failure: notCaptured(command, error) };
  }
}

export async function writeCapture(deps: Deps, target: DevVerifyTarget, gate: GateRun, when: string): Promise<Capture> {
  const folderShown = `${target.planDirShown}/capture-${target.batch}`;
  const folder = `${WORKSPACE}/${folderShown}`;
  const writer = new Writer(deps.files, folder);
  const testRoots = gate.roots.filter(isTestRoot);

  const status = gitStatusShort(gate.excludes);
  let statusText: string;
  try {
    statusText = (await deps.shell.run(status)).stdout;
  } catch (error) {
    statusText = text([notCaptured(status, error)]);
  }
  await writer.section("status", statusText);

  const entries = await diffs(deps, target, gate);
  await writer.section("changed-files", entries.length === 0 ? text(["no changed file"]) : text(entries.map((e) => e.line)));
  for (const e of entries) if (e.base !== undefined && e.content !== undefined) await writer.section(e.base, e.content);

  const build = await buildSection(deps, target, gate);
  await writer.section("build", build.content);
  await writer.section("cost", costSection(COST_NOT_COMPUTED));
  await writer.section("traits", traitsSection(gate.trait?.shown ?? null, gate.facts.ids, gate.traitHits));
  const tail = await testTail(deps, target);
  await writer.section("test-tail", tail.content);
  await writer.section("test-classes", await testClasses(deps, target, gate, testRoots));

  const methods = await methodHits(deps, gate, testRoots);
  const rows = mechanicalRows({
    build: build.state,
    trait: gate.trait, ids: gate.facts.ids,
    methods: gate.facts.methods, testRoots, methodHits: methods.hits,
    testLog: tail.log, testLogLooked: `${target.planDirShown}/logs/`,
    roots: gate.roots,
    cost: COST_NOT_COMPUTED,
    tickedLines: gate.facts.tickedLines, planDirName: basename(target.planDirShown),
    appliedRulesRow: gate.facts.appliedRulesRow, appliedIds: gate.facts.appliedIds,
  }).map((r) => (methods.failure !== null && r.check === CHECK_METHODS ? { ...r, result: "not checked" as const, evidence: methods.failure } : r));
  const table = renderTable(target.batch, rows);
  await writer.file("table.md", table);

  // Files has no delete: a file of an earlier run may stay in the folder; the manifest names
  // this run's files, and the brief cites only them.
  const manifest = text(["index.txt", "manifest.txt", ...writer.written.map((w) => w.name)]);
  await deps.files.write(`${folder}/manifest.txt`, manifest);
  const index = text([
    `# Audit capture — batch ${target.batch}`,
    `sheet: ${target.sheetShown}`,
    `generated: ${when}`,
    "gate: green",
    "files:",
    ...writer.written.map((w) => `- ${w.name} (${w.chars} chars)`),
  ]);
  const listed = writer.written.map((w) => w.path);
  await deps.files.write(`${folder}/index.txt`, index);

  return { folder, folderShown, files: [`${folder}/index.txt`, `${folder}/manifest.txt`, ...listed], rows, table, build: build.state, testRoots };
}
