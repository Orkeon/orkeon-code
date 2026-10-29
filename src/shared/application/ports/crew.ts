// The crew ports: the crews the host runs, the running crew's children, log, run state and memory.
// Types only, re-exported by ../ports.ts.

/** How a crew is launched (Orkeon #221). `chain: "continue"`: from a `completed`, the new instance keeps the
 *  chain depth of the instance whose `completed` runs instead of climbing one, so a driver that relaunches its
 *  own work after each cycle is not stopped by `Orkeon:Cli:ScriptCommands:MaxChainDepth`; outside a `completed`
 *  it changes nothing. */
export interface CrewLaunchOptions { chain?: "continue" }

/** The crews the host can run, by name. */
export interface CrewHost {
  /** The discovered crew names; empty when the host lists none or cannot list them. */
  listCrews(): string[];
  /** Start a crew and return its ticket at once: the completion reaches the async
   *  command's `completed`. Throws when the host cannot run crews, or refuses the hop. */
  launch(name: string, input: Record<string, unknown>, options?: CrewLaunchOptions): string;
}

/** One instance of a crew the host is running, launched from a command. */
export interface RunningCrew { ticket: string }

/** The crews the host is running now: what a command reads before it launches a crew that must not run twice. */
export interface RunningCrews {
  /** The running instances of the crew `crew`, by its name; empty when none runs or the host cannot list them. */
  running(crew: string): readonly RunningCrew[];
}

/** The children of the running crew (A-3): one background agent per call, its reply left in the crew's
 *  memory, its instance listed, stopped and sent to by id (`crew.instances()`, `stop`, `send`). */
export interface ChildRuntime {
  /** Starts `agent`, an agent of the crew, as a background child with `input`; throws when the host refuses. */
  spawn(agent: string, input: string): void;
  /** The crew's kept instances, oldest first. */
  instances(): ReadonlyArray<{ id: string; agent: string; state: string }>;
  /** Cancels a running instance; false when none runs under `id`. */
  stop(id: string): boolean;
  /** What a child left under `key` in the crew's memory; undefined until it does. */
  read(key: string): Promise<unknown>;
  /** Waits about `ms` milliseconds. */
  pause(ms: number): Promise<void>;
}

/** The running crew's log. */
export interface Logger {
  info(message: string): void;
  warn(message: string): void;
}

/** The running agent's own state: it lasts one crew run, where the session's
 *  state bag outlives it. */
export interface RunState {
  /** A field as stored; undefined when the run holds none. */
  read(field: string): unknown;
  /** Replace one field, keeping the others. */
  write(field: string, value: unknown): Promise<void>;
}

/** The running crew's own key/value memory, which its agents share for one run. */
export interface CrewMemory {
  /** Keep `value` under `key`, replacing what the key held. Throws when the host cannot store it. */
  store(key: string, value: unknown): Promise<void>;
}
