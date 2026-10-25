// The service locators the host provider's reader is tested on: an llm service with a CLR or a lower-case
// name, none, or one whose read throws.
import type { readHostProvider } from "./host-provider.ts";

type Services = Parameters<typeof readHostProvider>[0];

const services = (llm: unknown, has = true): Services => ({ has: () => has, get: <T>() => llm as T });

export const PROVIDER_CASES: readonly { name: string; services: Services; expected: string | undefined }[] = [
  { name: "reads the llm service's CLR Name", services: services({ Name: "deepseek" }), expected: "deepseek" },
  { name: "reads a lower-case name, trimmed", services: services({ name: " OpenAI " }), expected: "OpenAI" },
  { name: "reads nothing from an empty name", services: services({ Name: "" }), expected: undefined },
  { name: "reads nothing when the host wires no llm service", services: services({ Name: "x" }, false), expected: undefined },
  {
    name: "reads nothing when the read throws",
    services: { has: () => true, get: () => { throw new Error("not whitelisted"); } },
    expected: undefined,
  },
];
