// ProjectInit use case (/init): scan the layout, detect the build/test/lint
// conventions, read the instruction files already there, the README and the
// package map of the code index when one is built, compose AGENTS.md and write it
// (AGENTS.proposed.md when an existing file was too long to show whole). The
// steps live in ./detect.

import type { CodeIndex, Files, Llm, Logger } from "../../../shared/application/ports.ts";
import {
  scanLayout, readConfigs, detectConventions, readExistingInstructions, readReadme, readPackageMap,
  composeInstructionsFile, writeInstructionsFile,
} from "./detect.ts";

export interface ProjectInitDeps {
  files: Files;
  llm: Pick<Llm, "extract" | "complete">;
  log: Logger;
  /** The code index: its package map feeds the Architecture section when it holds a root; never built here. */
  index?: CodeIndex;
}

export async function runProjectInit(deps: ProjectInitDeps): Promise<string> {
  const { files, llm } = deps;
  const names = await scanLayout(files);
  const { blobs, text } = await readConfigs(files);
  const detected = await detectConventions(deps, text, blobs);
  const [existing, readme, packageMap] = await Promise.all([
    readExistingInstructions(files), readReadme(files), readPackageMap(deps),
  ]);
  const content = await composeInstructionsFile(llm, names, detected, existing, readme, packageMap);
  return await writeInstructionsFile(content, detected, files, existing);
}
