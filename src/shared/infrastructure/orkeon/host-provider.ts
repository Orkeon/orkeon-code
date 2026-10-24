// The name of the host's LLM provider, read from the command context's `llm`
// service (the host's ILlmProvider, optional: a host may wire none). Jint keeps
// the CLR member names, so the name is `Name`; `name` is read too. Like the
// script-host, the service comes from the context each command receives, so the
// reader takes the service locator as a parameter. Nothing here is offered to
// the model.

import type { ServiceLocator } from "../../../commands/.orkeon/orkeon-cli.d.ts";
import { pick } from "./tool-results.ts";

const LLM = "llm";

/** The provider's name (`deepseek`, `anthropic`, `OpenAI`...), undefined when the host wires none or the read fails. */
export function readHostProvider(services: Pick<ServiceLocator, "get" | "has">): string | undefined {
  try {
    if (!services.has(LLM)) return undefined;
    const name = String(pick(services.get<unknown>(LLM), "Name", "name") ?? "").trim();
    return name.length > 0 ? name : undefined;
  } catch {
    return undefined;
  }
}
