// The command instances the createRunningCrews tests read: a FakeCommandsService served as the "commands" service,
// and a builder of instances as the host registers them for a crew launched from a command (name: the command,
// targetAgent: `crew:<name>`, intent: the crew's name).
import { createRunningCrews } from "../../../../src/shared/infrastructure/orkeon/running-crews.ts";
import type { CommandInstanceState, CommandInstanceView } from "../../../../src/commands/.orkeon/orkeon-cli.d.ts";
import { FakeCommandsService } from "../../../support/doubles/fake-commands-service.ts";
import { FakeServiceLocator } from "../../../support/doubles/fake-script-host.ts";

/** A FakeCommandsService served as the "commands" service, and the port built over it. */
export function commandsOverFake() {
  const service = new FakeCommandsService();
  const services = new FakeServiceLocator();
  services.services.set("commands", service);
  return { service, running: createRunningCrews(services) };
}

/** An instance of a crew launched from a command, as the host's `commands.list` shows it. */
export function crewInstance(ticket: string, command: string, crew: string, state: CommandInstanceState): CommandInstanceView {
  return {
    ticket,
    name: command,
    kind: "async",
    targetAgent: `crew:${crew}`,
    intent: crew,
    correlationId: `c-${ticket}`,
    state,
    startedAt: "2026-10-29T10:00:00Z",
    elapsedMs: 1200,
    tokens: 0,
  };
}

/** What the host holds: a review running, a finished review, an admission running and a sync command of its own. */
export const HOST_INSTANCES: CommandInstanceView[] = [
  crewInstance("t2", "review", "code-review", "running"),
  crewInstance("t1", "review", "code-review", "done"),
  crewInstance("t5", "memory", "shared-memory-admit", "running"),
  { ...crewInstance("t6", "status", "status", "running"), kind: "sync", targetAgent: "" },
];

/** The crews asked about over HOST_INSTANCES, and the tickets expected: the running instances of that crew only. */
export const RUNNING_CASES: readonly { name: string; crew: string; expected: { ticket: string }[] }[] = [
  { name: "answers the running review only, not the finished one", crew: "code-review", expected: [{ ticket: "t2" }] },
  { name: "answers the running admission", crew: "shared-memory-admit", expected: [{ ticket: "t5" }] },
  { name: "answers nothing for a crew no command launched", crew: "dev-batches", expected: [] },
];
