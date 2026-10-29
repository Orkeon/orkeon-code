// FakeCommandsService: the host's `commands` service (CommandsFacade of the CLI typings), to test the adapters
// that read the command instances. `instances` is what the host holds; list() filters them as the host does
// (an omitted field is a wildcard, `state: "all"` too) and lands every filter received in `filters`.
// request() and post() dispatch nothing: a test that needs a launch uses FakeScriptHost.
import type {
  CommandInstanceFilter,
  CommandInstanceView,
  CommandResponse,
  CommandsFacade,
} from "../../../src/commands/.orkeon/orkeon-cli.d.ts";

export class FakeCommandsService implements CommandsFacade {
  instances: CommandInstanceView[] = [];
  filters: Array<CommandInstanceFilter | string | undefined> = [];

  request(_agent: string, _intent: string, _payload: string): CommandResponse {
    throw new Error("FakeCommandsService.request: not played by this fake");
  }

  post(_agent: string, _intent: string, _payload: string): string {
    throw new Error("FakeCommandsService.post: not played by this fake");
  }

  list(filter?: CommandInstanceFilter | string): readonly CommandInstanceView[] {
    this.filters.push(filter);
    if (typeof filter === "string") return this.instances.filter((i) => i.name === filter);
    return this.instances.filter(
      (i) =>
        (filter?.state === undefined || filter.state === "all" || i.state === filter.state) &&
        (filter?.name === undefined || i.name === filter.name) &&
        (filter?.agent === undefined || i.targetAgent === filter.agent),
    );
  }

  get(ticket: string): CommandInstanceView | undefined {
    return this.instances.find((i) => i.ticket === ticket);
  }

  cancel(_ticket: string): boolean {
    return false;
  }
}
