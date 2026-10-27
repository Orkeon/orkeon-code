// A FakeSessionService served under "session" by a FakeServiceLocator, and the adapter over it.
import type { SessionSwitch } from "../../../../src/shared/application/ports.ts";
import { createSessionSwitch } from "../../../../src/shared/infrastructure/orkeon/session-switch.ts";
import { FakeServiceLocator } from "../../../support/doubles/fake-script-host.ts";
import { FakeSessionService } from "../../../support/doubles/fake-session-service.ts";

export function switchOverFake(): { service: FakeSessionService; sw: SessionSwitch } {
  const service = new FakeSessionService();
  const services = new FakeServiceLocator();
  services.services.set("session", service);
  return { service, sw: createSessionSwitch(services)! };
}
