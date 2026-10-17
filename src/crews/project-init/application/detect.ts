// ProjectInit use case — scan layout, detect conventions, author CLAUDE.md.
// Orchestration + IO; pure parts live in ../domain/conventions and _shared.

import type { Files, Llm, Logger } from "../../../shared/application/ports.ts";
import { cleanLlmMarkdown } from "../../../shared/domain/strip.ts";
import type { DetectedConventions } from "../../../shared/domain/types.ts";
import { CONFIG_CANDIDATES, fallbackConventions } from "../domain/conventions.ts";
import { CONVENTIONS_SCHEMA, buildConventionsPrompt, buildClaudeMdPrompt } from "./prompts.ts";

/** Scan the workspace top level (mode B). */
export async function scanLayout(files: Files): Promise<string[]> {
  return await files.list("/workspace", 80);
}

/** Read the recognised config files directly (fileRead just fails on absent ones). */
export async function readConfigs(files: Files): Promise<{ blobs: Record<string, string>; text: string }> {
  const blobs: Record<string, string> = {};
  for (const c of CONFIG_CANDIDATES) {
    try {
      const text = await files.read("/workspace/" + c);
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

/** Compose + clean the CLAUDE.md body (mode C). */
export async function composeClaudeMd(
  llm: Pick<Llm, "complete">,
  names: string[],
  detected: DetectedConventions,
): Promise<string> {
  const md = await llm.complete(buildClaudeMdPrompt(names, detected));
  return cleanLlmMarkdown(md) + "\n";
}

/** Write CLAUDE.md and return the run summary. */
export async function writeClaudeMd(content: string, detected: DetectedConventions, files: Files): Promise<string> {
  await files.write("/workspace/CLAUDE.md", content);
  return `✓ wrote /workspace/CLAUDE.md (${content.length} bytes; build='${detected?.buildCommand ?? "?"}', test='${detected?.testCommand ?? "?"}')`;
}
