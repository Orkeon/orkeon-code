/// <reference path="../../../crews/.orkeon/orkeon.d.ts" />
// ReasoningReader over the runtime's `llm` namespace (Orkeon #359, #360): the configuration the session's turns run
// on (`llm.model(name)`, else `llm.default_`), its `capabilities`, and its `reasoning`, with the effort asked or as
// the host configures it. The runtime judges, as it judges the call; nothing is called. A host without the
// namespace, a provider that cannot tell: null. A named profile is never read: `llm.profile(name)` throws on a name
// the host does not declare, an error of the runtime that no `catch` of a script stops, and the runtime lists no
// profile to check the name against first; so a target on a profile answers null.

import type { ReasoningReader } from "../../application/ports.ts";
import { capabilitiesOf, effortReportOf } from "../../domain/agent-policy/reasoning.ts";
import type { ReasoningTarget } from "../../domain/agent-policy/reasoning.ts";

/** What the reader needs of the `llm` namespace. */
export type LlmConfigs = Pick<typeof llm, "default_" | "model">;

function configOf(host: LlmConfigs, target: ReasoningTarget): LlmConfig | null {
  if (target.profile !== null) return null;
  return target.model === "" ? host.default_ : host.model(target.model);
}

export function createReasoningReader(host: LlmConfigs | undefined): ReasoningReader {
  const read = <T>(target: ReasoningTarget, of: (config: LlmConfig) => T | null): T | null => {
    if (host === undefined) return null;
    try {
      const config = configOf(host, target);
      return config === null ? null : of(config);
    } catch {
      return null;
    }
  };
  return {
    capabilities: (target) => read(target, (config) => capabilitiesOf(config.capabilities)),
    effort: (target, level) => read(target, (config) => effortReportOf((level === null ? config : config.with({ effort: level })).reasoning)),
  };
}
