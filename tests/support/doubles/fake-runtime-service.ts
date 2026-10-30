// FakeRuntimeService: orkeon-repl's `runtime` service (RuntimeInfo of the CLI typings), to test
// the adapter. The fields are what the host would answer.
import type { RuntimeInfo } from "../../../src/commands/.orkeon/orkeon-cli.d.ts";

export class FakeRuntimeService implements RuntimeInfo {
  version = "1.0.0-rc.6";
  commit: string | null = "5fe53ac";
  channel = "source";
}
