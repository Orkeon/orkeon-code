// The session, config and model fakes runAdvisor is tested over.
import { createConfigStore } from "../../../../src/shared/application/config-store.ts";
import { FakeFiles } from "../../../support/doubles/fake-files.ts";
import { FakeLlm } from "../../../support/doubles/fake-llm.ts";
import { FakeLogger } from "../../../support/doubles/fake-logger.ts";
import { FakeSessionStore } from "../../../support/doubles/fake-session-store.ts";

/** What runAdvisor answers when there is no assistant answer to review. */
export const NOTHING = "Nothing to review: the session buffer holds no assistant answer yet.";

/** The last exchange of the session the builder makes. */
export const EXCHANGE = { request: "fix the parser", answer: "fixed it" };

/** A session holding EXCHANGE, a model answering "  looks right  \n", a logger, and the deps runAdvisor takes. */
export function advisorSetup() {
  const session = new FakeSessionStore();
  session.messages = [{ role: "user", content: EXCHANGE.request }, { role: "assistant", content: EXCHANGE.answer }];
  const llm = new FakeLlm();
  llm.completions = ["  looks right  \n"];
  const log = new FakeLogger();
  const deps = { session, config: createConfigStore({ files: new FakeFiles(), session }), llm, log };
  return { session, llm, log, deps };
}
