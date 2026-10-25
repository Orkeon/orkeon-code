// Config stores and shells readMemorySettings is tested over.
import type { ShellResult } from "../ports.ts";
import { GIT_REMOTE_ORIGIN } from "./memory-settings.ts";
import { FakeShell } from "../../../../tests/support/doubles/fake-shell.ts";

/** A config store holding `values`, every other key unset. */
export const configOf = (values: Record<string, string>) => ({
  readValue: async (key: string) => ({ key, value: values[key], source: values[key] === undefined ? "unset" as const : "file" as const }),
});

/** A config store that cannot read its files. */
export const THROWING_CONFIG = { readValue: async () => { throw new Error("no files"); } };

/** A shell whose origin remote answers `origin`. */
export function originAnswering(origin: Partial<ShellResult>): FakeShell {
  const shell = new FakeShell();
  shell.results[GIT_REMOTE_ORIGIN] = origin;
  return shell;
}
