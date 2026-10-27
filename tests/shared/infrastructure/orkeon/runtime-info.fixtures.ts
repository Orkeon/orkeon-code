// A FakeRuntimeService served under "runtime" by a FakeServiceLocator, and the adapter over it.
import { createRuntimeInfo } from "../../../../src/shared/infrastructure/orkeon/runtime-info.ts";
import { FakeRuntimeService } from "../../../support/doubles/fake-runtime-service.ts";
import { FakeServiceLocator } from "../../../support/doubles/fake-script-host.ts";

export function runtimeOverFake() {
  const service = new FakeRuntimeService();
  const services = new FakeServiceLocator();
  services.services.set("runtime", service);
  return { service, reader: createRuntimeInfo(services) };
}
