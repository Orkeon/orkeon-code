// FakeSessionService: orkeon-repl's `session` service (SessionFacade of the CLI typings), to test the adapter.
// `own` is what save() answers, `loaded` what load() answers; the calls land in `saves` and `loads`.
import type { SessionFacade } from "../../../src/commands/.orkeon/orkeon-cli.d.ts";

export class FakeSessionService implements SessionFacade {
  own = "/sessions/proj-1a2b3c/last.json";
  loaded = 3;
  saves: Array<string | undefined> = [];
  loads: string[] = [];

  async save(path?: string): Promise<string> {
    this.saves.push(path);
    return path ?? this.own;
  }

  async load(path: string): Promise<number> {
    this.loads.push(path);
    return this.loaded;
  }
}
