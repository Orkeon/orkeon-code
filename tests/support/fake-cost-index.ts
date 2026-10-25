// FakeCostIndex: the CostIndex port answering its fields. `roots` answers `indexed`, `refresh` the
// `refreshErrors`, `accessCost` the `report` and the `errors`; an Error in `failure[<call>]` is thrown by
// that call. Every call lands in `calls`, and the files of each refresh in `refreshed`.
// FakeGraphIndex adds the graph (`affected_tests`): `affected` answers `tests` over an empty, bounded
// default, or throws it when it is an Error; the files it was asked about land in `asked`.
import type { AffectedTests, CostIndex } from "../../src/shared/application/ports.ts";
import type { AccessCostReport } from "../../src/shared/domain/dev/access-cost.ts";

export class FakeCostIndex implements CostIndex {
  indexed: string[] = ["/workspace"];
  refreshErrors: string[] = [];
  report: AccessCostReport | null = { members: [], cost: { reads: 0, writes: 0, loops: 0, lambdas: 0, memoryFilters: 0 } };
  errors: string[] = [];
  failure: Partial<Record<"roots" | "refresh" | "accessCost", Error>> = {};
  calls: string[] = [];
  refreshed: string[][] = [];

  async roots(): Promise<string[]> {
    this.calls.push("roots");
    if (this.failure.roots) throw this.failure.roots;
    return this.indexed;
  }

  async refresh(root: string, files: readonly string[]): Promise<string[]> {
    this.calls.push(`refresh ${root} ${files.join(",")}`);
    this.refreshed.push([...files]);
    if (this.failure.refresh) throw this.failure.refresh;
    return this.refreshErrors;
  }

  async accessCost(files: readonly string[], receivers: string | undefined) {
    this.calls.push(`accessCost ${files.join(",")}${receivers === undefined ? "" : ` ${receivers}`}`);
    if (this.failure.accessCost) throw this.failure.accessCost;
    return { report: this.report, errors: this.errors };
  }
}

export class FakeGraphIndex extends FakeCostIndex {
  tests: Partial<AffectedTests> | Error = {};
  asked: string[][] = [];

  async affected(files: readonly string[]): Promise<AffectedTests> {
    this.asked.push([...files]);
    if (this.tests instanceof Error) throw this.tests;
    return { all: false, projects: [], classes: [], unresolved: [], ...this.tests };
  }
}
