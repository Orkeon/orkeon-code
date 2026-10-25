// FakeAnchorIndex: the AnchorIndex port. `closure` answers `closures[<first fqn>]`, over an empty one, or
// throws `failures[<first fqn>]`; every call lands in `calls`.
import type { AnchorClosure, AnchorIndex } from "../../src/shared/application/ports.ts";

export class FakeAnchorIndex implements AnchorIndex {
  closures: Record<string, AnchorClosure> = {};
  failures: Record<string, Error> = {};
  calls: string[] = [];

  async closure(fqns: readonly string[]): Promise<AnchorClosure> {
    this.calls.push(`closure ${fqns.join(" ")}`);
    const failure = this.failures[fqns[0]];
    if (failure !== undefined) throw failure;
    return this.closures[fqns[0]] ?? { nodes: [], unresolved: [], truncated: false };
  }
}
