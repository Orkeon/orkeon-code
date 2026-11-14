// The targets the reader of orkeon/reasoning.ts is asked about, over FakeLlmConfigs (tests/support/doubles/).

/** The host's own model, a /model override, the session's profile over an override, a profile the host lacks. */
export const BOOT = { profile: null, model: "" };
export const OVERRIDE = { profile: null, model: "my-custom" };
export const PROFILED = { profile: "guarded", model: "my-custom" };
export const UNDECLARED_PROFILE = { profile: "ghost", model: "" };

/** `medium` on GLM-5.3 as the runtime reports it: sent as `low`. */
export const MEDIUM_ON_GLM = { model: "glm-5.3", asked: "medium", sent: "low", notice: "lowered" };

/** Targets on a profile: never read, since `llm.profile(name)` fails past every catch on a name the host lacks. */
export const PROFILE_CASES = [
  { name: "a profile the host declares", target: PROFILED },
  { name: "a profile the host does not declare", target: UNDECLARED_PROFILE },
] as const;
