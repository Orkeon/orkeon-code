// The ProfilePicker adapters over a FakePickService: served as a command's `pick` service, or as a crew's
// `ctx.llm.pick`.
import type { RouteBounds } from "../../../../src/shared/domain/agents/model-route.ts";
import { createLlmProfilePicker, createServicesProfilePicker } from "../../../../src/shared/infrastructure/orkeon/profile-picker.ts";
import { FakePickService } from "../../../support/doubles/fake-pick-service.ts";
import { FakeServiceLocator } from "../../../support/doubles/fake-script-host.ts";

export const REQUEST = "Run the crew 'dev-plan' of a coding assistant for this command of its user:\n/dev-plan x";
export const OPTIONS: RouteBounds = { ladder: ["small", "large"], ceiling: "large", fallback: "large" };

/** A command's services that serve the pick, and the picker over them. */
export function pickerOverServices() {
  const service = new FakePickService();
  const services = new FakeServiceLocator();
  services.services.set("pick", service);
  return { service, services, picker: createServicesProfilePicker(services) };
}

/** A crew's `ctx.llm` whose `pick` is the fake's, and the picker over it. */
export function pickerOverLlm() {
  const service = new FakePickService();
  return { service, picker: createLlmProfilePicker(service) };
}

/** The bounds of a session on the top rung under a rule: every one of them given. */
export const ALL_BOUNDS: RouteBounds = { ladder: ["small", "medium", "large"], floor: "medium", ceiling: "large", fallback: "large" };

/** What the runtime throws on a ladder that names a profile the host does not declare. */
export const REFUSED_LADDER = "services.get(\"pick\").pick { profile.ladder } 'tiny' is not a profile of this host (known: small, large)";
/** What the runtime throws on a floor above the ceiling. */
export const REFUSED_FLOOR = "ctx.llm.pick { profile.floor } 'large' is above the ceiling 'small' on the ladder (small, large)";
/** What a locator throws when it is used outside the run that got it. */
export const LOCATOR_GONE = "the services of this run are gone";

/** A crew's `ctx.llm` whose `pick` cannot even be read. */
export function llmWhosePickThrows(): object {
  return Object.defineProperty({}, "pick", { get: () => { throw new Error(LOCATOR_GONE); } });
}

/** The spellings of the runtime's default profile, all read as the host's default model. */
export const DEFAULT_SPELLINGS: readonly string[] = ["default", "Default", " default "];

/** A reply whose pick and probability are not what the runtime documents: both read as absent. */
export const MISTYPED_PICK = { profile: { value: "small", reason: "model", picked: 3, probability: "0.9" } };

export const MODEL_PICK = { value: "small", reason: "model", picked: "small", probability: 0.9 };

/** Replies of the runtime that read as no answer. */
export const UNREAD: readonly { readonly name: string; readonly reply: unknown }[] = [
  { name: "answers nothing when the reply has no profile part", reply: {} },
  { name: "answers nothing when the reason is not one of the pick's", reply: { profile: { value: "small", reason: "guess", picked: null, probability: null } } },
  { name: "answers nothing when the value is not a name", reply: { profile: { value: 3, reason: "model", picked: null, probability: null } } },
  { name: "answers nothing when the reply is empty", reply: undefined },
];
