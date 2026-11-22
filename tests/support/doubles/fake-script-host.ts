// FakeScriptHost: the runtime's script-host service (ScriptHostFacade), to test
// the CrewHost adapter. `crews` is what listCrews answers, `listFailure` makes it
// throw; every launch lands in `launches`, with its options when given, and gets the
// ticket `ticket-<n>`.
// FakeServiceLocator serves it, or nothing, as `ctx.services` does.
import type {
  CrewLaunchOptions, CrewRunOutput, ScriptHostFacade, ServiceLocator,
} from "../../../src/commands/.orkeon/orkeon-cli.d.ts";

export class FakeScriptHost implements ScriptHostFacade {
  crews: string[] = [];
  listFailure: Error | null = null;
  launches: Array<{ name: string; input: Record<string, unknown> | undefined; options?: CrewLaunchOptions }> = [];

  runCrew(name: string, input?: Record<string, unknown>): CrewRunOutput {
    this.launches.push({ name, input });
    return { ok: true, streamed: false };
  }

  runCrewAsync(name: string, input?: Record<string, unknown>, options?: CrewLaunchOptions): string {
    this.launches.push(options === undefined ? { name, input } : { name, input, options });
    return `ticket-${this.launches.length}`;
  }

  listCrews(): readonly string[] {
    if (this.listFailure) throw this.listFailure;
    return this.crews;
  }
}

export class FakeServiceLocator implements ServiceLocator {
  services = new Map<string, unknown>();
  /** When set, thrown by every lookup: a locator used outside the run that got it. */
  failure: Error | null = null;

  get<T = unknown>(name: string): T {
    if (this.failure) throw this.failure;
    return this.services.get(name) as T;
  }

  has(name: string): boolean {
    if (this.failure) throw this.failure;
    return this.services.has(name);
  }
}
