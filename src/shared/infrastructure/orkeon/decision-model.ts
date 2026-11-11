// DecisionModel adapter over the host's `system_one_decide` tool, which the host registers when its settings
// configure a decision provider (`Orkeon:Decision:Provider`, or a provider section alone), whichever it is. The
// tool is in no built-in list, so its member of the `tools` namespace is looked up by name: absent, there is no
// decision model. It answers `{ success, answers, model, error }`; a refusal of the model is `success: false`.

import type { DecisionModel } from "../../application/ports.ts";
import { parseDecisionAnswers } from "../../domain/decision/questions.ts";
import { toolMemberName } from "./tool-catalogue.ts";
import { pick } from "./tool-results.ts";

/** The tool the host's decision model is asked through. */
export const DECIDE_TOOL = "system_one_decide";

export function createDecisionModel(tools: object): DecisionModel {
  const member = (): unknown => (tools as Record<string, unknown> | undefined)?.[toolMemberName(DECIDE_TOOL)];
  return {
    available: () => typeof member() === "function",
    ask: async (state, questions) => {
      const decide = member();
      if (typeof decide !== "function") return null;
      try {
        const reply = await (decide as (input: Record<string, unknown>) => unknown)({ state, questions });
        if (pick(reply, "success", "Success") !== true) return null;
        return parseDecisionAnswers(questions, pick(reply, "answers", "Answers"));
      } catch {
        return null;
      }
    },
  };
}
