// The checks of launcher.runtime.test.ts.
import { ok, strictEqual } from "node:assert";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { CURL_CALL, OWN_REPL_RAN } from "./launcher.runtime.fixtures.ts";
import type { Run } from "./launcher.fixtures.ts";

const entries = (dir: string) => (existsSync(dir) ? readdirSync(dir) : []);

/** The runtime folder holds `id` alone, its REPL executable, and no download left over. */
export function assertRuntimeInstalled(runtimeHome: string, id: string): void {
  strictEqual(entries(runtimeHome).join(" "), id, `${runtimeHome} holds the runtime ${id} and nothing else`);
  ok((statSync(join(runtimeHome, id, "bin", "orkeon-repl")).mode & 0o111) !== 0, "bin/orkeon-repl is executable");
}

/** The runtime folder holds nothing: neither a runtime nor the rest of a download. */
export function assertNoRuntimeKept(runtimeHome: string): void {
  strictEqual(entries(runtimeHome).join(" "), "", `${runtimeHome} holds nothing`);
}

/** curl was never called and the runtime folder holds nothing. */
export function assertNothingDownloaded(r: Run, runtimeHome: string): void {
  ok(!r.calls.some((c) => c.startsWith("curl ")), `curl was called: ${r.calls.join(", ")}`);
  assertNoRuntimeKept(runtimeHome);
}

/** The archive was asked for once, at the URL .orkeon-runtime names. */
export function assertDownloadedOnce(r: Run): void {
  strictEqual(r.calls.filter((c) => c.startsWith("curl ")).join(", "), CURL_CALL, "one download, of the archive of this platform");
}

/** The REPL that started is the downloaded runtime's, from the project. */
export function assertOwnReplStarted(r: Run): void {
  ok(r.calls.includes(OWN_REPL_RAN), `the downloaded runtime's REPL did not start: ${r.stderr}`);
  strictEqual(r.cwd, r.project, "the REPL runs from the project");
}

/** No REPL started and no state folder was made. */
export function assertNothingStarted(r: Run): void {
  strictEqual(r.cwd, "", "no REPL started");
  ok(!existsSync(join(r.state, "output")), "no state made");
}
