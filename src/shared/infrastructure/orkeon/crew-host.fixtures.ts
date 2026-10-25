// The crew host the createCrewHost tests drive: a FakeScriptHost served by a FakeServiceLocator.
import { createCrewHost } from "./crew-host.ts";
import { FakeScriptHost, FakeServiceLocator } from "../../../../tests/support/fake-script-host.ts";

/** A FakeScriptHost registered as the "script-host" service, and the CrewHost built over it. */
export function crewHostOverFake() {
  const host = new FakeScriptHost();
  const services = new FakeServiceLocator();
  services.services.set("script-host", host);
  return { host, services, crews: createCrewHost(services) };
}
