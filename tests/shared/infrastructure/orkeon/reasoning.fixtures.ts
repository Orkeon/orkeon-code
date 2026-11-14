/// <reference path="../../../../src/crews/.orkeon/orkeon.d.ts" />
// An `llm` namespace as the runtime binds it, for the reader of orkeon/reasoning.ts: GLM-5.3 by default, which
// lowers `medium`; any other model named is unknown to the table; the profile `guarded` runs GLM-5.3 too, and any
// other profile throws, as an undeclared one does. Every configuration asked lands in `asked`.
import type { LlmConfigs } from "../../../../src/shared/infrastructure/orkeon/reasoning.ts";

type Level = "low" | "medium" | "high" | "xhigh" | "max";
const GLM_LEVELS: readonly Level[] = ["low", "high", "max"];

function config(model: string, profile: string | undefined, effort: Level | undefined): LlmConfig {
  const known = model === "glm-5.3";
  const sent: Level | undefined = effort === undefined || !known || GLM_LEVELS.includes(effort) ? effort : "low";
  return {
    provider: "zai",
    ...(profile === undefined ? {} : { profile }),
    model,
    capabilities: { model, known, thinking: known ? "effortOnly" : "toggle", efforts: known ? GLM_LEVELS : ["low", "medium", "high", "xhigh", "max"] },
    reasoning: effort === undefined
      ? null
      : { model, asked: effort, sent: sent ?? null, notice: !known ? "unchecked" : sent === effort ? null : "lowered" },
    with: (overrides) => config(overrides.model ?? model, profile, overrides.effort ?? effort),
  };
}

export function hostLlm(): LlmConfigs & { asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    get default_() {
      asked.push("default");
      return config("glm-5.3", undefined, undefined);
    },
    model(name) {
      asked.push(`model:${name}`);
      return config(name, undefined, undefined);
    },
    profile(name) {
      asked.push(`profile:${name}`);
      if (name !== "guarded") throw new Error(`unknown LLM profile '${name}'`);
      return config("glm-5.3", name, undefined);
    },
  };
}

/** The host's own model, a /model override, the session's profile over an override, a profile the host lacks. */
export const BOOT = { profile: null, model: "" };
export const OVERRIDE = { profile: null, model: "my-custom" };
export const PROFILED = { profile: "guarded", model: "my-custom" };
export const UNDECLARED_PROFILE = { profile: "ghost", model: "" };
