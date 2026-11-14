/// <reference path="../../../crews/.orkeon/orkeon.d.ts" />
// ReasoningReader over the runtime's `llm` namespace (Orkeon #359, #360): the configuration the session's turns run
// on (`llm.profile(name)`, else `llm.model(name)`, else `llm.default_`), its `capabilities`, and the `reasoning` of
// that configuration with the effort asked. The runtime judges, as it judges the call; nothing is called. A host
// without the namespace, a profile it does not declare (the runtime throws), a provider that cannot tell: null.

import type { ReasoningReader } from "../../application/ports.ts";
import { capabilitiesOf, effortReportOf } from "../../domain/agent-policy/reasoning.ts";
import type { ReasoningTarget } from "../../domain/agent-policy/reasoning.ts";

/** What the reader needs of the `llm` namespace. */
export type LlmConfigs = Pick<typeof llm, "default_" | "model" | "profile">;

function configOf(host: LlmConfigs, target: ReasoningTarget): LlmConfig {
  if (target.profile !== null) return host.profile(target.profile);
  return target.model === "" ? host.default_ : host.model(target.model);
}

export function createReasoningReader(host: LlmConfigs | undefined): ReasoningReader {
  const read = <T>(target: ReasoningTarget, of: (config: LlmConfig) => T | null): T | null => {
    if (host === undefined) return null;
    try {
      return of(configOf(host, target));
    } catch {
      return null;
    }
  };
  return {
    capabilities: (target) => read(target, (config) => capabilitiesOf(config.capabilities)),
    effort: (target, level) => read(target, (config) => effortReportOf(config.with({ effort: level }).reasoning)),
  };
}
