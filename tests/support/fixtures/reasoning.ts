// What the runtime answers about a model's reasoning (Orkeon #359, #360), as the tests of /effort, /model and the
// main loop read it: GLM-5.3 on Z.AI, which takes low, high and max, a model with no reasoning pass, a model the
// capability table does not know, and the ways an effort does not go as asked.
import type { EffortReport, ReasoningCapabilities } from "../../../src/shared/domain/agent-policy/reasoning.ts";

/** GLM-5.3 on Z.AI: an effort hint with no off switch, three levels of the five. */
export const GLM_TAKES: ReasoningCapabilities = { model: "glm-5.3", known: true, thinking: "effortOnly", efforts: ["low", "high", "max"] };

/** A model with no reasoning pass. */
export const TAKES_NO_EFFORT: ReasoningCapabilities = { model: "plain-1", known: true, thinking: "none", efforts: [] };

/** A model the capability table does not know: the runtime answers its provider's levels, `known: false`. */
export const UNKNOWN_TAKES: ReasoningCapabilities = { model: "my-custom", known: false, thinking: "toggle", efforts: ["low", "medium", "high"] };

/** `medium` on GLM-5.3: sent as `low`. */
export const MEDIUM_LOWERED: EffortReport = { model: "glm-5.3", asked: "medium", sent: "low", notice: "lowered" };

/** `medium` on a model that takes no effort: none sent. */
export const MEDIUM_DROPPED: EffortReport = { model: "plain-1", asked: "medium", sent: null, notice: "dropped" };

/** `high` on GLM-5.3: sent as asked. */
export const HIGH_AS_ASKED: EffortReport = { model: "glm-5.3", asked: "high", sent: "high", notice: null };

/** `high` on a model that takes no effort: none sent. */
export const HIGH_DROPPED: EffortReport = { model: "plain-1", asked: "high", sent: null, notice: "dropped" };

/** `high` on a model the capability table does not know: sent unchecked. */
export const HIGH_UNCHECKED: EffortReport = { model: "my-custom", asked: "high", sent: "high", notice: "unchecked" };

/** `xhigh` on a model the capability table does not know, whose provider takes no `xhigh`: sent as `high`. */
export const XHIGH_LOWERED_UNKNOWN: EffortReport = { model: "my-custom", asked: "xhigh", sent: "high", notice: "lowered" };

/** `medium` on a model that takes it: sent as asked. */
export const MEDIUM_AS_ASKED: EffortReport = { model: "kimi-k3", asked: "medium", sent: "medium", notice: null };

/** A model that takes `medium`, on a host whose settings switch its thinking off. */
export const QWEN_TAKES: ReasoningCapabilities = { model: "qwen-3", known: true, thinking: "toggle", efforts: ["low", "medium", "high"] };

/** `medium` on that host: the model takes it, the settings drop it. */
export const MEDIUM_SWITCHED_OFF: EffortReport = { model: "qwen-3", asked: "medium", sent: null, notice: "dropped" };
