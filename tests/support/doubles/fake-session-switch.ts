// FakeSessionSwitch: the SessionSwitch port. `own` is the virtual path save() answers without a path; every save
// lands in `saves` (undefined for the session's own file), every load in `loads`, answered with `loaded` messages;
// `saveFailure` and `loadFailure` make the call reject, as the host does for a path it refuses or a file it cannot
// read.
import type { SessionSwitch } from "../../../src/shared/application/ports.ts";

export class FakeSessionSwitch implements SessionSwitch {
  own = "/sessions/proj-1a2b3c/last.json";
  loaded = 5;
  saves: Array<string | undefined> = [];
  loads: string[] = [];
  saveFailure: Error | null = null;
  loadFailure: Error | null = null;

  async save(path?: string): Promise<string> {
    if (this.saveFailure) throw this.saveFailure;
    this.saves.push(path);
    return path ?? this.own;
  }

  async load(path: string): Promise<number> {
    if (this.loadFailure) throw this.loadFailure;
    this.loads.push(path);
    return this.loaded;
  }
}
