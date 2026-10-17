// InitVerifiers use case (/init-verifiers): classify the project's test readiness,
// then author one verification skill per zone that lacks a verifier. The steps
// live in ./authoring.

import type { Files, Llm, Logger } from "../../../shared/application/ports.ts";
import { scanLayout, readPackageJson, detectReadiness, authorVerifiers } from "./authoring.ts";

export interface InitVerifiersDeps {
  files: Files;
  llm: Pick<Llm, "extract" | "complete">;
  log: Logger;
}

export async function runInitVerifiers(deps: InitVerifiersDeps): Promise<string> {
  const { files, llm } = deps;
  const names = await scanLayout(files);
  const pkg = await readPackageJson(files);
  const readiness = await detectReadiness(deps, names, pkg);

  const zones: string[] = readiness?.zonesNeedingVerifier ?? [];
  if (zones.length === 0) {
    return `No verifier gaps detected (types: ${(readiness?.appTypes ?? []).join(", ") || "unknown"}).`;
  }
  const written = await authorVerifiers(llm, zones, files);
  return `✓ authored ${written} verifier skill(s) under /output/verifiers/ (zones: ${zones.join(", ")})`;
}
