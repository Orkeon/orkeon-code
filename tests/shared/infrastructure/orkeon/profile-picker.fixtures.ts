// The ProfilePicker adapters over a FakePickService: served as a command's `pick` service, or as a crew's
// `ctx.llm.pick`.
import type { ProfilePickOptions } from "../../../../src/shared/application/ports.ts";
import { createLlmProfilePicker, createServicesProfilePicker } from "../../../../src/shared/infrastructure/orkeon/profile-picker.ts";
import { FakePickService } from "../../../support/doubles/fake-pick-service.ts";
import { FakeServiceLocator } from "../../../support/doubles/fake-script-host.ts";

export const REQUEST = "A coding assistant is about to run its crew 'dev-plan' for this command of its user:\n/dev-plan x";
export const OPTIONS: ProfilePickOptions = { ladder: ["small", "large"], ceiling: "large", fallback: "large" };

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

export const MODEL_PICK = { value: "small", reason: "model", picked: "small", probability: 0.9 };

/** Replies of the runtime that read as no answer. */
export const UNREAD: readonly { readonly name: string; readonly reply: unknown }[] = [
  { name: "answers nothing when the reply has no profile part", reply: {} },
  { name: "answers nothing when the reason is not one of the pick's", reply: { profile: { value: "small", reason: "guess", picked: null, probability: null } } },
  { name: "answers nothing when the value is not a name", reply: { profile: { value: 3, reason: "model", picked: null, probability: null } } },
  { name: "answers nothing when the reply is empty", reply: undefined },
];
