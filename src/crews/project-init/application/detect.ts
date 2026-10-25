// ProjectInit use case — scan the layout, detect the conventions, author the
// instructions file (AGENTS.md). Orchestration + IO; pure parts live in
// ../domain/conventions and ./prompts.

import type { Files, Llm, Logger } from "../../../shared/application/ports.ts";
import { cleanLlmMarkdown } from "../../../shared/domain/strip.ts";
import type { DetectedConventions } from "../../../shared/domain/types.ts";
import { CONFIG_CANDIDATES, fallbackConventions } from "../domain/conventions.ts";
import { CONVENTIONS_SCHEMA, buildConventionsPrompt, buildInstructionsFilePrompt } from "./prompts.ts";
import { INSTRUCTIONS_FILE_WRITTEN } from "../../../shared/domain/instructions-file.ts";
import type { InstructionsFile } from "../../../shared/domain/instructions-file.ts";
import { WORKSPACE } from "../../../shared/domain/vfs.ts";

/** The instruction files /init reads and merges: its own, an older CLAUDE.md, and
 *  the ones other assistants keep. */
export const EXISTING_INSTRUCTION_FILES = ["AGENTS.md", "CLAUDE.md", ".cursorrules", ".github/copilot-instructions.md"];

/** Characters read of each existing instruction file, and of the README. */
export const MAX_EXISTING_FILE_CHARS = 6_000;
export const MAX_README_CHARS = 4_000;

/** Scan the workspace top level (mode B). */
export async function scanLayout(files: Files): Promise<string[]> {
  return await files.list(WORKSPACE, 80);
}

/** Read the recognised config files directly (fileRead just fails on absent ones). */
export async function readConfigs(files: Files): Promise<{ blobs: Record<string, string>; text: string }> {
  const blobs: Record<string, string> = {};
  for (const c of CONFIG_CANDIDATES) {
    try {
      const text = await files.read(`${WORKSPACE}/${c}`);
      if (text.length > 0) blobs[c] = text.slice(0, 4000);
    } catch { /* unreadable / absent — skip */ }
  }
  const text = Object.entries(blobs).map(([f, b]) => `--- ${f} ---\n${b}`).join("\n\n");
  return { blobs, text };
}

/** Detect conventions (structured); tolerate a non-JSON reply via the fallback. */
export async function detectConventions(
  deps: { llm: Pick<Llm, "extract">; log: Logger },
  configText: string,
  blobs: Record<string, string>,
): Promise<DetectedConventions> {
  if (configText.length === 0) return { frameworks: [], conventions: [] };
  try {
    return (await deps.llm.extract(buildConventionsPrompt(configText), CONVENTIONS_SCHEMA)) as DetectedConventions;
  } catch {
    deps.log.warn("convention extract failed; continuing with package.json scripts only");
    return fallbackConventions(blobs["package.json"] ?? "{}");
  }
}

/** The instruction files already in the project, in EXISTING_INSTRUCTION_FILES order. */
export async function readExistingInstructions(files: Pick<Files, "read">): Promise<InstructionsFile[]> {
  const found: InstructionsFile[] = [];
  for (const file of EXISTING_INSTRUCTION_FILES) {
    try {
      const content = await files.read(`${WORKSPACE}/${file}`);
      if (content.trim().length > 0) found.push({ file, content: content.slice(0, MAX_EXISTING_FILE_CHARS) });
    } catch { /* absent — skip */ }
  }
  return found;
}

/** The start of the README; "" when there is none. */
export async function readReadme(files: Pick<Files, "read">): Promise<string> {
  try {
    return (await files.read(`${WORKSPACE}/README.md`)).slice(0, MAX_README_CHARS);
  } catch {
    return "";
  }
}

/** Compose + clean the instructions file (mode C). */
export async function composeInstructionsFile(
  llm: Pick<Llm, "complete">,
  names: string[],
  detected: DetectedConventions,
  existing: readonly InstructionsFile[] = [],
  readme = "",
): Promise<string> {
  const prompt = buildInstructionsFilePrompt(names, detected, existing, readme);
  const md = await llm.complete(prompt.user, { system: prompt.system });
  return cleanLlmMarkdown(md) + "\n";
}

/** Write the instructions file and return the run summary; says when an older
 *  CLAUDE.md was merged and kept, since the loop now reads AGENTS.md first. */
export async function writeInstructionsFile(
  content: string,
  detected: DetectedConventions,
  files: Files,
  existing: readonly InstructionsFile[] = [],
): Promise<string> {
  const path = `${WORKSPACE}/${INSTRUCTIONS_FILE_WRITTEN}`;
  await files.write(path, content);
  const merged = existing.some((f) => f.file === "CLAUDE.md") && !existing.some((f) => f.file === INSTRUCTIONS_FILE_WRITTEN)
    ? "; CLAUDE.md merged and kept, the assistant now reads AGENTS.md first"
    : "";
  return `✓ wrote ${path} (${content.length} bytes; build='${detected?.buildCommand ?? "?"}', test='${detected?.testCommand ?? "?"}')${merged}`;
}
