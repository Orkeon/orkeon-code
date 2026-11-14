/// <reference path="../../../crews/.orkeon/orkeon.d.ts" />
// ReasoningReader over the runtime's `llm` namespace (Orkeon #359, #360, #364): the configuration the session's
// turns run on (`llm.profile(name)`, else `llm.model(name)`, else `llm.default_`), its `capabilities`, and its
// `reasoning`, with the effort asked or as the host configures it. The runtime judges, as it judges the call;
// nothing is called. A profile is asked for only when `llm.profiles` lists its name: one the host does not declare
// answers null, as do a host without the namespace and a provider that cannot tell.

import type { ReasoningReader } from "../../application/ports.ts";
import { capabilitiesOf, effortReportOf } from "../../domain/agent-policy/reasoning.ts";
import type { ReasoningTarget } from "../../domain/agent-policy/reasoning.ts";

/** What the reader needs of the `llm` namespace. */
export type LlmConfigs = Pick<typeof llm, "default_" | "model" | "profile" | "profiles">;

/** Whether the host declares the profile `name`, compared as `llm.profile` compares: trimmed, without case. */
function declares(host: LlmConfigs, name: string): boolean {
  const wanted = name.trim().toLowerCase();
  return host.profiles.some((declared) => declared.toLowerCase() === wanted);
}

function configOf(host: LlmConfigs, target: ReasoningTarget): LlmConfig | null {
  if (target.profile !== null) return declares(host, target.profile) ? host.profile(target.profile) : null;
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
