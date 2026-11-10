// ProjectInit use case — scan the layout, detect the conventions, author the
// instructions file (AGENTS.md). Orchestration + IO; pure parts live in
// ../domain/conventions and ./prompts.

import type { CodeIndex, Files, Llm, Logger } from "../../../shared/application/ports.ts";
import { manifestsAsMaterial, readConfigFiles } from "../../../shared/application/project-manifests.ts";
import { cleanLlmMarkdown } from "../../../shared/domain/strip.ts";
import { fallbackConventions } from "../domain/conventions.ts";
import type { ProjectConventions } from "../domain/conventions.ts";
import { clipExistingFiles, instructionsTarget, proposalNote } from "../domain/existing-files.ts";
import type { ExistingFile } from "../domain/existing-files.ts";
import { MAX_MAP_PACKAGES, renderPackageMap } from "../domain/package-map.ts";
import { CONVENTIONS_SCHEMA, buildConventionsPrompt, buildInstructionsFilePrompt } from "./prompts.ts";
import { INSTRUCTIONS_FILE_WRITTEN } from "../../../shared/domain/instructions-file.ts";
import { WORKSPACE } from "../../../shared/domain/vfs.ts";
import { CLAUDE_MD_MERGED, codeIndexSilent, CONVENTION_EXTRACT_FAILED, wroteInstructions } from "./messages.ts";

/** The instruction files /init reads and merges: its own, an older CLAUDE.md, and
 *  the ones other assistants keep. */
export const EXISTING_INSTRUCTION_FILES = ["AGENTS.md", "CLAUDE.md", ".cursorrules", ".github/copilot-instructions.md"];

/** Characters read of the README. */
export const MAX_README_CHARS = 4_000;

/** Scan the workspace top level (mode B). */
export async function scanLayout(files: Files): Promise<string[]> {
  return await files.list(WORKSPACE, 80);
}

/** Read the configurations present (commands first, the CI workflows, rules after), each cut as the shared
 *  module cuts it. */
export async function readConfigs(files: Files): Promise<{ blobs: Record<string, string>; text: string }> {
  const manifests = await readConfigFiles(files);
  const blobs: Record<string, string> = {};
  for (const m of manifests) blobs[m.path] = m.content;
  return { blobs, text: manifestsAsMaterial(manifests) };
}

/** Detect conventions (structured); tolerate a non-JSON reply via the fallback. */
export async function detectConventions(
  deps: { llm: Pick<Llm, "extract">; log: Logger },
  configText: string,
  blobs: Record<string, string>,
): Promise<ProjectConventions> {
  if (configText.length === 0) return { frameworks: [], conventions: [] };
  try {
    return (await deps.llm.extract(buildConventionsPrompt(configText), CONVENTIONS_SCHEMA)) as ProjectConventions;
  } catch {
    deps.log.warn(CONVENTION_EXTRACT_FAILED);
    return fallbackConventions(blobs["package.json"] ?? "{}");
  }
}

/** The instruction files already in the project, in EXISTING_INSTRUCTION_FILES order, each whole up to
 *  MAX_EXISTING_FILE_CHARS and all of them up to MAX_EXISTING_FILES_CHARS, else cut and its cut counted. */
export async function readExistingInstructions(files: Pick<Files, "read">): Promise<ExistingFile[]> {
  const found: ExistingFile[] = [];
  for (const file of EXISTING_INSTRUCTION_FILES) {
    try {
      const content = await files.read(`${WORKSPACE}/${file}`);
      if (content.trim().length > 0) found.push({ file, content });
    } catch { /* absent — skip */ }
  }
  return clipExistingFiles(found);
}

/** The start of the README; "" when there is none. */
export async function readReadme(files: Pick<Files, "read">): Promise<string> {
  try {
    return (await files.read(`${WORKSPACE}/README.md`)).slice(0, MAX_README_CHARS);
  } catch {
    return "";
  }
}

/** The package map of the code index, rendered; "" when there is no index, when it holds no root (/init
 *  starts no indexing) or when it does not answer, which is logged. */
export async function readPackageMap(deps: { index?: CodeIndex; log: Logger }): Promise<string> {
  const { index } = deps;
  if (!index) return "";
  try {
    if ((await index.rootCount()) === 0) return "";
    const map = await index.map("L1_Package", false, MAX_MAP_PACKAGES);
    const graph = await index.dependencyGraph("L1_Package", MAX_MAP_PACKAGES);
    return renderPackageMap(map.entries, graph);
  } catch (e) {
    deps.log.warn(codeIndexSilent(e instanceof Error ? e.message : String(e)));
    return "";
  }
}

/** Compose + clean the instructions file (mode C). */
export async function composeInstructionsFile(
  llm: Pick<Llm, "complete">,
  names: string[],
  detected: ProjectConventions,
  existing: readonly ExistingFile[] = [],
  readme = "",
  packageMap = "",
): Promise<string> {
  const prompt = buildInstructionsFilePrompt(names, detected, existing, readme, packageMap);
  const md = await llm.complete(prompt.user, { system: prompt.system });
  return cleanLlmMarkdown(md) + "\n";
}

/** Write the instructions file and return the run summary; says when an older
 *  CLAUDE.md was merged and kept, since the loop now reads AGENTS.md first. When an
 *  existing file was cut for the model, AGENTS.md is left as it is: the file goes to
 *  AGENTS.proposed.md, and the summary says why. */
export async function writeInstructionsFile(
  content: string,
  detected: ProjectConventions,
  files: Files,
  existing: readonly ExistingFile[] = [],
): Promise<string> {
  const path = `${WORKSPACE}/${instructionsTarget(existing)}`;
  await files.write(path, content);
  const proposal = proposalNote(existing);
  const merged = proposal === "" && existing.some((f) => f.file === "CLAUDE.md") && !existing.some((f) => f.file === INSTRUCTIONS_FILE_WRITTEN)
    ? CLAUDE_MD_MERGED
    : "";
  return wroteInstructions(path, content.length, detected?.buildCommand ?? "?", detected?.testCommand ?? "?", `${merged}${proposal}`);
}
