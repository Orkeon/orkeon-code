// InitVerifiers use case — detect app type + test tooling, author one
// verification skill per zone lacking a verifier. Orchestration + IO.

import type { Files, Llm, Logger } from "../../../shared/application/ports.ts";
import { cleanLlmMarkdown } from "../../../shared/domain/strip.ts";
import type { TestReadiness } from "../../../shared/domain/types.ts";
import { safeZoneName, fallbackReadiness } from "../domain/readiness.ts";
import { READINESS_SCHEMA, buildReadinessPrompt, buildVerifierSkillPrompt } from "./prompts.ts";

/** Scan the workspace top level. */
export async function scanLayout(files: Files): Promise<string[]> {
  return await files.list("/workspace", 80);
}

/** Read package.json (best-effort; empty string when absent). */
export async function readPackageJson(files: Files): Promise<string> {
  try {
    return (await files.read("/workspace/package.json")).slice(0, 4000);
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

/** Author one verifier skill per zone; returns the count written. */
export async function authorVerifiers(llm: Pick<Llm, "complete">, zones: string[], files: Files): Promise<number> {
  let written = 0;
  for (const zone of zones) {
    const skill = await llm.complete(buildVerifierSkillPrompt(zone));
    await files.write(`/output/verifiers/verify-${safeZoneName(zone)}.md`, cleanLlmMarkdown(skill) + "\n");
    written++;
  }
  return written;
}
