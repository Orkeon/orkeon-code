// InitVerifiers use case (/init-verifiers): classify the project's test readiness,
// then author one verification skill per zone that lacks a verifier. The steps
// live in ./authoring.

import type { Files, Llm, Logger } from "../../../shared/application/ports.ts";
import { readVerifierFacts, detectReadiness, authorVerifiers } from "./authoring.ts";
import { authoredVerifiers, noVerifierGaps } from "./messages.ts";

export interface InitVerifiersDeps {
  files: Files;
  llm: Pick<Llm, "extract" | "complete">;
  log: Logger;
}

export async function runInitVerifiers(deps: InitVerifiersDeps): Promise<string> {
  const { files, llm } = deps;
  const facts = await readVerifierFacts(files);
  const readiness = await detectReadiness(deps, facts);

  const zones: string[] = readiness?.zonesNeedingVerifier ?? [];
  if (zones.length === 0) {
    return noVerifierGaps((readiness?.appTypes ?? []).join(", ") || "unknown");
  }
  const written = await authorVerifiers(llm, zones, files, { material: facts.material, readiness });
  return authoredVerifiers(written, zones.join(", "));
}
