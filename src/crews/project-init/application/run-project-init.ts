// ProjectInit use case (/init): scan the layout, detect the build/test/lint
// conventions, read the instruction files already there and the README, compose
// AGENTS.md and write it. The steps live in ./detect.

import type { Files, Llm, Logger } from "../../../shared/application/ports.ts";
import {
  scanLayout, readConfigs, detectConventions, readExistingInstructions, readReadme,
  composeInstructionsFile, writeInstructionsFile,
} from "./detect.ts";

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
  const [existing, readme] = await Promise.all([readExistingInstructions(files), readReadme(files)]);
  const content = await composeInstructionsFile(llm, names, detected, existing, readme);
  return await writeInstructionsFile(content, detected, files, existing);
}
