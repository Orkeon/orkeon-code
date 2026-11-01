// InitVerifiers use case — detect app type + test tooling, author one
// verification skill per zone lacking a verifier. Orchestration + IO.

import type { Files, Llm, Logger } from "../../../shared/application/ports.ts";
import { cleanLlmMarkdown } from "../../../shared/domain/strip.ts";
import type { TestReadiness } from "../../../shared/domain/types.ts";
import { fallbackReadiness } from "../domain/readiness.ts";
import { commandsSection } from "../domain/commands-section.ts";
import { verifierPath } from "../../../shared/domain/verifiers.ts";
import { readInstructionsFile } from "../../../shared/application/instructions-file.ts";
import { MAX_CONFIG_FILE_CHARS, cutLine } from "../../../shared/domain/project-manifests.ts";
import { manifestsAsMaterial, readConfigFiles } from "../../../shared/application/project-manifests.ts";
import type { ManifestText } from "../../../shared/application/project-manifests.ts";
import { READINESS_SCHEMA, buildReadinessPrompt, buildVerifierSkillPrompt, renderVerifierMaterial } from "./prompts.ts";
import { WORKSPACE } from "../../../shared/domain/vfs.ts";

/** What the crew reads of the project: the top-level names, package.json for the fallback, the rendered material. */
export interface VerifierFacts {
  names: string[];
  pkg: string;
  material: string;
}

/** Scan the workspace top level. */
export async function scanLayout(files: Files): Promise<string[]> {
  return await files.list(WORKSPACE, 80);
}

/**
 * The `## Commands` section of the project's instructions file, the one the loop
 * reads (readInstructionsFile: the first of INSTRUCTIONS_FILES present and not
 * blank), cut at MAX_CONFIG_FILE_CHARS with a cut line; null when that file has
 * no such section or no instructions file exists.
 */
export async function readCommandsSection(files: Pick<Files, "read">): Promise<{ file: string; section: string } | null> {
  const instructions = await readInstructionsFile(files);
  if (!instructions) return null;
  const whole = commandsSection(instructions.content);
  if (!whole) return null;
  const cut = whole.length - MAX_CONFIG_FILE_CHARS;
  const section = cut > 0 ? `${whole.slice(0, MAX_CONFIG_FILE_CHARS)}\n${cutLine(cut, "this section")}` : whole;
  return { file: instructions.file, section };
}

/** The text of the top-level package.json among the manifests; "" when there is none. */
function packageJsonOf(manifests: readonly ManifestText[]): string {
  const pkg = manifests.find((m) => m.path === "package.json");
  return pkg?.content ?? "";
}

/** Read what both prompts see: the manifests and the CI workflows (commands first, rules after), and the
 *  Commands section. */
export async function readVerifierFacts(files: Files): Promise<VerifierFacts> {
  const names = await scanLayout(files);
  const manifests = await readConfigFiles(files);
  const commands = await readCommandsSection(files);
  const material = renderVerifierMaterial({ manifests: manifestsAsMaterial(manifests), commands });
  return { names, pkg: packageJsonOf(manifests), material };
}

/** Classify readiness (structured); tolerate a non-JSON reply via the fallback. */
export async function detectReadiness(
  deps: { llm: Pick<Llm, "extract">; log: Logger },
  facts: VerifierFacts,
): Promise<TestReadiness> {
  try {
    return (await deps.llm.extract(buildReadinessPrompt(facts.names, facts.material), READINESS_SCHEMA)) as TestReadiness;
  } catch {
    deps.log.warn("readiness extract failed; falling back to a package.json heuristic");
    return fallbackReadiness(facts.pkg);
  }
}

/** Author one verifier skill per zone from the project's facts; returns the count written. */
export async function authorVerifiers(
  llm: Pick<Llm, "complete">,
  zones: string[],
  files: Files,
  facts: { material?: string; readiness?: TestReadiness } = {},
): Promise<number> {
  let written = 0;
  for (const zone of zones) {
    const prompt = buildVerifierSkillPrompt(zone, facts);
    const skill = await llm.complete(prompt.user, { system: prompt.system });
    await files.write(verifierPath(zone), cleanLlmMarkdown(skill) + "\n");
    written++;
  }
  return written;
}
