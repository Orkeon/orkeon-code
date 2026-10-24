// Which spec or change brief a /dev-plan run plans, and its text: the token the user typed
// (a work code, a path, or nothing) resolved against the work folder, then the file read
// and parsed. It reads listings and one file; it writes nothing. Every refusal is a text
// the command and the crew print as they are.
import type { Files } from "../ports.ts";
import type { WorkFolder } from "./resolve-work-folder.ts";
import { WORKSPACE_ROOT } from "./resolve-work-folder.ts";
import { listDevCodes } from "./load-dev-context.ts";
import { classifyArtefact, isCode } from "../../domain/dev/artefacts.ts";
import { parsePlanSource } from "../../domain/dev/spec-format.ts";
import type { PlanSource, SourceKind } from "../../domain/dev/spec-format.ts";

export interface ResolvedSource {
  kind: SourceKind;
  code: string;            // "prune"
  prefix: string;          // code.toUpperCase(): the <CODE> of the file names, "PRUNE"
  folderShown: string;     // "workbench/prune"
  sourceShown: string;     // "workbench/prune/SPEC-prune.md"
}
export const MAX_SOURCE_CHARS = 200_000;

type Resolution = { ok: true; source: ResolvedSource } | { ok: false; text: string };

const LIST_CAP = 500;
const firstLine = (e: unknown): string => (e instanceof Error ? e.message : String(e)).split("\n")[0];
const refuse = (text: string): Resolution => ({ ok: false, text });

function resolved(kind: SourceKind, code: string, folderShown: string, fileName: string): Resolution {
  const sourceShown = folderShown === "" ? fileName : `${folderShown}/${fileName}`;
  return { ok: true, source: { kind, code, prefix: code.toUpperCase(), folderShown, sourceShown } };
}

/** The spec or the brief of one code folder, found by listing it. */
async function byCode(files: Pick<Files, "list">, work: WorkFolder, vfsPath: string, code: string): Promise<Resolution> {
  let names: string[];
  try {
    names = await files.list(`${vfsPath}/${code}`, LIST_CAP);
  } catch {
    names = [];
  }
  const spec = names.includes(`SPEC-${code}.md`);
  const change = names.includes(`CHANGE-${code}.md`);
  const shown = `${work.folder}/${code}`;
  if (spec && change) return refuse(`dev-plan: ${shown}/ holds both SPEC-${code}.md and CHANGE-${code}.md: name the file`);
  if (!spec && !change) return refuse(`dev-plan: ${shown}/ holds no SPEC-${code}.md nor CHANGE-${code}.md`);
  return resolved(spec ? "spec" : "change", code, shown, spec ? `SPEC-${code}.md` : `CHANGE-${code}.md`);
}

/** A path relative to the checkout, or under /workspace/, naming a spec or a brief. */
function byPath(token: string): Resolution {
  const notSource = refuse(`dev-plan: '${token}' is neither a code nor a SPEC-<code>.md / CHANGE-<code>.md path`);
  let relative = token.replace(/^\.\//, "");
  if (relative.startsWith("/")) {
    if (!relative.startsWith(`${WORKSPACE_ROOT}/`)) return notSource;
    relative = relative.slice(WORKSPACE_ROOT.length + 1);
  }
  // `/workspace/./.claude/x` and `/workspace//.claude/x` name `.claude/x`: the `.` and empty segments go first.
  const segments = relative.split("/").filter((s) => s !== "" && s !== ".");
  if (segments.some((s) => s === "..")) return notSource;
  const fileName = segments.at(-1) ?? "";
  const artefact = classifyArtefact(fileName);
  if (artefact === null || (artefact.kind !== "spec" && artefact.kind !== "change") || !isCode(artefact.prefix)) return notSource;
  if (segments[0] === ".claude") {
    return refuse("dev-plan: a source under .claude/ is the harness's own: copy it to the work folder first");
  }
  return resolved(artefact.kind, artefact.prefix, segments.slice(0, -1).join("/"), fileName);
}

const looksLikePath = (token: string): boolean => {
  const kind = classifyArtefact(token.slice(token.lastIndexOf("/") + 1))?.kind;
  return token.includes("/") || kind === "spec" || kind === "change";
};

/** The source the token names (a code, a path, or nothing); the refusal text otherwise. */
export async function resolvePlanSource(
  files: Pick<Files, "list" | "read">, work: WorkFolder, token: string | null,
): Promise<{ ok: true; source: ResolvedSource } | { ok: false; text: string }> {
  if (work.vfsPath === null) {
    return refuse(`dev-plan: the work folder ${work.folder} is outside /workspace: run /dev-plan from the main worktree`);
  }
  if (token !== null && looksLikePath(token)) return byPath(token);
  if (token !== null) {
    if (!isCode(token)) return byPath(token);
    return byCode(files, work, work.vfsPath, token);
  }
  let codes: string[];
  try {
    codes = (await listDevCodes({ files }, work)).filter((c) => (c.spec || c.change) && !c.plan).map((c) => c.code);
  } catch {
    codes = [];
  }
  if (codes.length === 0) {
    return refuse(`dev-plan: no SPEC- or CHANGE- file without a plan in ${work.folder}/: name one, e.g. /dev-plan <code>`);
  }
  if (codes.length > 1) {
    return refuse(`dev-plan: several codes could be planned (${codes.join(", ")}): name one, e.g. /dev-plan ${codes[0]}`);
  }
  return byCode(files, work, work.vfsPath, codes[0]);
}

/** Reads the source (≤ MAX_SOURCE_CHARS) and parses it; the refusal text when it cannot be read. */
export async function readPlanSource(
  files: Pick<Files, "read">, source: ResolvedSource,
): Promise<{ ok: true; text: string; parsed: PlanSource } | { ok: false; text: string }> {
  let text: string;
  try {
    text = await files.read(`${WORKSPACE_ROOT}/${source.sourceShown}`, MAX_SOURCE_CHARS);
  } catch (e) {
    return { ok: false, text: `dev-plan: ${source.sourceShown} cannot be read (${firstLine(e)})` };
  }
  return { ok: true, text, parsed: parsePlanSource(text, source.kind) };
}
