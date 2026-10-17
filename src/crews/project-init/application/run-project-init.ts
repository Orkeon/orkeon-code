// ProjectInit use case (/init): scan the layout, detect the build/test/lint
// conventions, compose CLAUDE.md and write it. The steps live in ./detect.

import type { Files, Llm, Logger } from "../../../shared/application/ports.ts";
import { scanLayout, readConfigs, detectConventions, composeClaudeMd, writeClaudeMd } from "./detect.ts";

export interface ProjectInitDeps {
  files: Files;
  llm: Pick<Llm, "extract" | "complete">;
  log: Logger;
}

export async function runProjectInit(deps: ProjectInitDeps): Promise<string> {
  const { files, llm } = deps;
  const names = await scanLayout(files);
  const { blobs, text } = await readConfigs(files);
  const detected = await detectConventions(deps, text, blobs);
  const content = await composeClaudeMd(llm, names, detected);
  return await writeClaudeMd(content, detected, files);
}
