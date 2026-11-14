// The targets the reader of orkeon/reasoning.ts is asked about, over FakeLlmConfigs (tests/support/doubles/).

/** The host's own model, a /model override, the session's profile over an override, a profile the host lacks. */
export const BOOT = { profile: null, model: "" };
export const OVERRIDE = { profile: null, model: "my-custom" };
export const PROFILED = { profile: "guarded", model: "my-custom" };
export const UNDECLARED_PROFILE = { profile: "ghost", model: "" };
/** The profile every host lists first: its own configuration, whatever the case and the override. */
export const DEFAULT_PROFILE = { profile: "Default", model: "my-custom" };
/** What the runtime throws on a host with no provider. */
export const NO_PROVIDER = "no LLM provider is configured";

/** `medium` on GLM-5.3 as the runtime reports it: sent as `low`. */
export const MEDIUM_ON_GLM = { model: "glm-5.3", asked: "medium", sent: "low", notice: "lowered" };

/** The profiles the host of these tests declares: `Guarded` on GLM-5.3, spelled with a capital. */
export const HOST_PROFILES = { Guarded: "glm-5.3" };

/** Targets on a profile the host declares, however the session spells it: the profile is read, the override is not. */
export const DECLARED_PROFILE_CASES = [
  { name: "the session's profile over a /model override", target: PROFILED },
  { name: "a profile spelled in another case, with spaces around", target: { profile: " GUARDED ", model: "" } },
] as const;
