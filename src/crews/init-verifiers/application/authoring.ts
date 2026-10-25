// InitVerifiers use case — detect app type + test tooling, author one
// verification skill per zone lacking a verifier. Orchestration + IO.

import type { Files, Llm, Logger } from "../../../shared/application/ports.ts";
import { cleanLlmMarkdown } from "../../../shared/domain/strip.ts";
import type { TestReadiness } from "../../../shared/domain/types.ts";
import { fallbackReadiness } from "../domain/readiness.ts";
import { verifierPath } from "../../../shared/domain/verifiers.ts";
import { READINESS_SCHEMA, buildReadinessPrompt, buildVerifierSkillPrompt } from "./prompts.ts";
import { WORKSPACE } from "../../../shared/domain/vfs.ts";

/** Scan the workspace top level. */
export async function scanLayout(files: Files): Promise<string[]> {
  return await files.list(WORKSPACE, 80);
}

/** Read package.json (best-effort; empty string when absent). */
export async function readPackageJson(files: Files): Promise<string> {
  try {
    return (await files.read(`${WORKSPACE}/package.json`)).slice(0, 4000);
  } catch {
    return "";
  }
}

/** Classify readiness (structured); tolerate a non-JSON reply via the fallback. */
export async function detectReadiness(
  deps: { llm: Pick<Llm, "extract">; log: Logger },
  names: string[],
  pkg: string,
): Promise<TestReadiness> {
  try {
    return (await deps.llm.extract(buildReadinessPrompt(names, pkg), READINESS_SCHEMA)) as TestReadiness;
  } catch {
    deps.log.warn("readiness extract failed; falling back to a package.json heuristic");
    return fallbackReadiness(pkg);
  }
}

/** Author one verifier skill per zone from the project's facts; returns the count written. */
export async function authorVerifiers(
  llm: Pick<Llm, "complete">,
  zones: string[],
  files: Files,
  facts: { pkg?: string; readiness?: TestReadiness } = {},
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
