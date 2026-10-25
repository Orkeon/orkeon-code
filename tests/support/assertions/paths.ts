// The checks on paths every family makes. Shared by the assertions files beside the tests.
import { ok } from "node:assert";

/** Every one of `paths` starts with `folder`. */
export function assertAllUnder(paths: readonly string[], folder: string): void {
  for (const path of paths) ok(path.startsWith(folder), `${path} is not under ${folder}`);
}
