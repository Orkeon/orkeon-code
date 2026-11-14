/// <reference path="../../../src/crews/.orkeon/orkeon.d.ts" />
// FakeLlmConfigs: a stand-in for the runtime's `llm` namespace, to test the ReasoningReader of
// src/shared/infrastructure/orkeon/reasoning.ts. The host boots on `bootModel` (GLM-5.3, which takes low, high and
// max and lowers any other level to low); any other model named is unknown to the capability table and takes what
// is asked, unchecked. `hostEffort` is what the host's own `Llm:Thinking:Effort` asks for (undefined: none). Every
// configuration asked lands in `asked` ("default", "model:<name>").
import type { LlmConfigs } from "../../../src/shared/infrastructure/orkeon/reasoning.ts";

type Level = "low" | "medium" | "high" | "xhigh" | "max";
const GLM_LEVELS: readonly Level[] = ["low", "high", "max"];
const PROVIDER_LEVELS: readonly Level[] = ["low", "medium", "high", "xhigh", "max"];

function config(model: string, effort: Level | undefined): LlmConfig {
  const known = model === "glm-5.3";
  const sent: Level | undefined = effort === undefined || !known || GLM_LEVELS.includes(effort) ? effort : "low";
  return {
    provider: "zai",
    model,
    capabilities: { model, known, thinking: known ? "effortOnly" : "toggle", efforts: known ? GLM_LEVELS : PROVIDER_LEVELS },
    reasoning: effort === undefined
      ? null
      : { model, asked: effort, sent: sent ?? null, notice: !known ? "unchecked" : sent === effort ? null : "lowered" },
    with: (overrides) => config(overrides.model ?? model, overrides.effort ?? effort),
  };
}

export class FakeLlmConfigs implements LlmConfigs {
  bootModel = "glm-5.3";
  hostEffort: Level | undefined = undefined;
  asked: string[] = [];

  get default_(): LlmConfig {
    this.asked.push("default");
    return config(this.bootModel, this.hostEffort);
  }

  model(name: string): LlmConfig {
    this.asked.push(`model:${name}`);
    return config(name, this.hostEffort);
  }
}
