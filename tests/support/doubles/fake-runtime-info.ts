// FakeRuntimeInfo: the RuntimeInfoReader port. `info` is what read() answers: undefined (the default)
// plays a host that names no runtime.
import type { RuntimeInfo, RuntimeInfoReader } from "../../../src/shared/application/ports.ts";

export class FakeRuntimeInfo implements RuntimeInfoReader {
  info: RuntimeInfo | undefined = undefined;

  read(): RuntimeInfo | undefined {
    return this.info;
  }
}
