// FakeConfigStore: the layered value reads of the ConfigStore (readValue). `values` is what each key resolves to (a
// key absent from it is unset); `reads` lists the keys read, in order.
import type { ConfigStore } from "../../../src/shared/application/config-store.ts";
import type { ConfigResolution } from "../../../src/shared/domain/config-schema.ts";

export class FakeConfigStore implements Pick<ConfigStore, "readValue"> {
  values: Record<string, string> = {};
  reads: string[] = [];

  async readValue(key: string): Promise<ConfigResolution> {
    this.reads.push(key);
    const value = this.values[key];
    return { key, value, source: value === undefined ? "unset" : "file" };
  }
}
