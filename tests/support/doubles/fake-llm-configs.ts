/// <reference path="../../../src/crews/.orkeon/orkeon.d.ts" />
// FakeLlmConfigs: a stand-in for the runtime's `llm` namespace, to test the ReasoningReader of
// src/shared/infrastructure/orkeon/reasoning.ts. The host boots on `bootModel` (GLM-5.3, which takes low, high and
// max); any other model named is unknown to the capability table and takes its provider's levels, unchecked (Z.AI:
// all but xhigh). A level not taken goes out as the highest taken below it, else the lowest taken, as the runtime
// sends it. `hostEffort` is what the host's own `Llm:Thinking:Effort` asks for (undefined: none).
// `profileModels` maps each profile the host declares to its model; `profiles` lists their names after "default",
// `profile("default")`, in any case, is the host's own configuration, and `profile(name)` throws on any other
// name, as the runtime does. `refusal`, when set, is the error every configuration asked throws (a host with no
// provider). Every configuration asked lands in `asked` ("default", "model:<name>", "profile:<name>").
import type { LlmConfigs } from "../../../src/shared/infrastructure/orkeon/reasoning.ts";

type Level = "low" | "medium" | "high" | "xhigh" | "max";
const GLM_LEVELS: readonly Level[] = ["low", "high", "max"];
const PROVIDER_LEVELS: readonly Level[] = ["low", "medium", "high", "max"];
const ORDER: readonly Level[] = ["low", "medium", "high", "xhigh", "max"];

/** The level sent for `effort` on a model taking `taken`: itself, else the highest taken below it, else the lowest. */
function sentFor(effort: Level, taken: readonly Level[]): Level {
  if (taken.includes(effort)) return effort;
  const below = taken.filter((level) => ORDER.indexOf(level) < ORDER.indexOf(effort));
  return (below.at(-1) ?? taken[0]) as Level;
}

function config(model: string, effort: Level | undefined): LlmConfig {
  const known = model === "glm-5.3";
  const taken = known ? GLM_LEVELS : PROVIDER_LEVELS;
  const sent = effort === undefined ? undefined : sentFor(effort, taken);
  return {
    provider: "zai",
    model,
    capabilities: { model, known, thinking: known ? "effortOnly" : "toggle", efforts: taken },
    reasoning: effort === undefined
      ? null
      : { model, asked: effort, sent: sent ?? null, notice: sent !== effort ? "lowered" : known ? null : "unchecked" },
    with: (overrides) => config(overrides.model ?? model, overrides.effort ?? effort),
  };
}

export class FakeLlmConfigs implements LlmConfigs {
  bootModel = "glm-5.3";
  hostEffort: Level | undefined = undefined;
  profileModels: Record<string, string> = {};
  refusal: string | null = null;
  asked: string[] = [];

  private refuse(): void {
    if (this.refusal !== null) throw new Error(this.refusal);
  }

  get profiles(): readonly string[] {
    return ["default", ...Object.keys(this.profileModels)];
  }

  get default_(): LlmConfig {
    this.asked.push("default");
    this.refuse();
    return config(this.bootModel, this.hostEffort);
  }

  model(name: string): LlmConfig {
    this.asked.push(`model:${name}`);
    this.refuse();
    return config(name, this.hostEffort);
  }

  profile(name: string): LlmConfig {
    this.asked.push(`profile:${name}`);
    this.refuse();
    if (name.trim().toLowerCase() === "default") return config(this.bootModel, this.hostEffort);
    const declared = Object.keys(this.profileModels).find((known) => known.toLowerCase() === name.trim().toLowerCase());
    if (declared === undefined) throw new Error(`llm.profile("${name}") names the LLM profile '${name}', which this host does not offer.`);
    return config(this.profileModels[declared] as string, this.hostEffort);
  }
}
