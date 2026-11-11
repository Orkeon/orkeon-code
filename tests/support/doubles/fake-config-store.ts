// FakeConfigStore: the layered value reads of the ConfigStore (readValue) and its session override map. `values` is
// what each key resolves to (a key absent from it is unset); `reads` lists the keys read, in order. `session` is the
// override map readSession answers and writeSession replaces; a key it holds wins over `values`, as the session wins.
import type { ConfigStore } from "../../../src/shared/application/config-store.ts";
import type { ConfigResolution } from "../../../src/shared/domain/config-schema.ts";

export class FakeConfigStore implements Pick<ConfigStore, "readValue" | "readSession" | "writeSession"> {
  values: Record<string, string> = {};
  session: Record<string, unknown> = {};
  reads: string[] = [];

  async readValue(key: string): Promise<ConfigResolution> {
    this.reads.push(key);
    const override = this.session[key];
    if (typeof override === "string") return { key, value: override, source: "session" };
    const value = this.values[key];
    return { key, value, source: value === undefined ? "unset" : "file" };
  }

  async readSession(): Promise<Record<string, unknown>> {
    return { ...this.session };
  }

  async writeSession(map: Record<string, unknown>): Promise<void> {
    this.session = { ...map };
  }
}
