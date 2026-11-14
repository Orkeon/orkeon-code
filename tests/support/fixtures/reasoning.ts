// What the runtime answers about a model's reasoning (Orkeon #359, #360), as the tests of /effort, /model and the
// main loop read it: GLM-5.3 on Z.AI, which takes low, high and max, and the three ways an effort does not go as
// asked.
import type { EffortReport, ReasoningCapabilities } from "../../../src/shared/domain/agent-policy/reasoning.ts";

/** GLM-5.3 on Z.AI: an effort hint with no off switch, three levels of the five. */
export const GLM_TAKES: ReasoningCapabilities = { model: "glm-5.3", known: true, thinking: "effortOnly", efforts: ["low", "high", "max"] };

/** A model with no reasoning pass. */
export const TAKES_NO_EFFORT: ReasoningCapabilities = { model: "plain-1", known: true, thinking: "none", efforts: [] };

/** `medium` on GLM-5.3: sent as `low`. */
export const MEDIUM_LOWERED: EffortReport = { model: "glm-5.3", asked: "medium", sent: "low", notice: "lowered" };

/** `high` on GLM-5.3: sent as asked. */
export const HIGH_AS_ASKED: EffortReport = { model: "glm-5.3", asked: "high", sent: "high", notice: null };

/** `high` on a model that takes no effort: none sent. */
export const HIGH_DROPPED: EffortReport = { model: "plain-1", asked: "high", sent: null, notice: "dropped" };

/** `high` on a model the capability table does not know: sent unchecked. */
export const HIGH_UNCHECKED: EffortReport = { model: "my-custom", asked: "high", sent: "high", notice: "unchecked" };
