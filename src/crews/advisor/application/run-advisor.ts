// Advisor use case (/advisor review, B-12): a one-shot second opinion on the
// session's last exchange, asked of `advisor.model` when one is set. What it asks
// and how the verdict is labelled are pure, in ../domain/advice.

import type { Llm, Logger, SessionStore } from "../../../shared/application/ports.ts";
import type { ConfigStore } from "../../../shared/application/config-store.ts";
import { lastExchange, buildAdvicePrompt, describeAdvisor, earlierTurns } from "../domain/advice.ts";

export interface AdvisorDeps {
  session: Pick<SessionStore, "readMessages">;
  config: Pick<ConfigStore, "readValue">;
  llm: Pick<Llm, "complete">;
  log: Logger;
}

export async function runAdvisor(deps: AdvisorDeps): Promise<string> {
  const { session, config, llm, log } = deps;
  const [messages, advisorModel] = await Promise.all([
    session.readMessages().then((read) => read.messages).catch(() => []),
    config.readValue("advisor.model").then((r) => (r.value ?? "").trim()).catch(() => ""),
  ]);

  const exchange = lastExchange(messages);
  if (!exchange) {
    return "Nothing to review: the session buffer holds no assistant answer yet.";
  }

  const header = describeAdvisor(advisorModel);
  // Logged as a warning when it is a self-review, so the weakness of the verdict
  // is on the record and not only in the text a reader may skim.
  if (advisorModel.length === 0) log.warn(header);
  else log.info(header);

  // The override is what makes this worth running: the reviewer is not the author.
  const prompt = buildAdvicePrompt(exchange, earlierTurns(messages));
  const request = advisorModel.length > 0 ? { system: prompt.system, model: advisorModel } : { system: prompt.system };
  const advice = await llm.complete(prompt.user, request);

  return `── ${header}\n\n${String(advice ?? "").trim()}`;
}
