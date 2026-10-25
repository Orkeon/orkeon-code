// FakeChildRuntime: the ChildRuntime port over the dev-plan children. A spawned child lands in `spawned`
// and runs (its row in `rows` names the agent by its id, as the runtime's does) until `script` says
// otherwise: `script(n, runtime)` runs after the n-th pause, each pause moving the clock (`clock`, from
// `now`) by its ms unless `advance` is false. A stop lands in `stops` and turns a running row into
// `stoppedAs`, leaving the rejected act of the child in `memory` when `stopLeavesFailure`; `finish(n,
// outcome)` ends child n with its outcome. `read` answers from `memory`.
import type { ChildRuntime } from "../../../src/shared/application/ports.ts";

export class FakeChildRuntime implements ChildRuntime {
  now = Date.parse("2026-10-24T10:00:00.000Z");
  rows: Array<{ id: string; agent: string; state: string }> = [];
  memory = new Map<string, unknown>();
  spawned: Array<{ agent: string; input: string }> = [];
  stops: string[] = [];
  pauses = 0;
  advance = true;
  /** Called after each pause with its number: what the child does meanwhile. */
  script: (n: number, rt: FakeChildRuntime) => void = () => undefined;
  clock = () => new Date(this.now);

  spawn(agent: string, input: string): void {
    this.spawned.push({ agent, input });
    this.rows.push({ id: `a${this.rows.length + 1}`, agent: `01JAGENTID${agent.length}`, state: "running" });
  }
  instances() { return this.rows; }
  /** What a stopped child's row becomes, and whether its body leaves its rejected act behind (the real path). */
  stoppedAs = "stopped";
  stopLeavesFailure = true;
  stop(id: string): boolean {
    this.stops.push(id);
    const n = this.rows.findIndex((r) => r.id === id && r.state === "running");
    if (n < 0) return false;
    this.rows[n].state = this.stoppedAs;
    if (this.stopLeavesFailure) this.memory.set(`dev-plan:child:${n + 1}`, { ok: false, error: "The operation was canceled." });
    return true;
  }
  async read(key: string): Promise<unknown> { return this.memory.get(key); }
  async pause(ms: number): Promise<void> {
    this.pauses += 1;
    if (this.advance) this.now += ms;
    this.script(this.pauses, this);
  }
  /** The child of `n` leaves its outcome and ends. */
  finish(n: number, outcome: unknown): void {
    this.memory.set(`dev-plan:child:${n}`, outcome);
    this.rows[n - 1].state = "completed";
  }
}
