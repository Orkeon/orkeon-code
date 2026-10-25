// The session /export renders, and the fakes runExport is run over.
import type { ExportInputs } from "../src/commands/_lib/export.ts";
import { FakeFiles } from "./support/doubles/fake-files.ts";
import { FakeMemoryStore } from "./support/doubles/fake-memory-store.ts";
import { FakeSessionStore } from "./support/doubles/fake-session-store.ts";
import { FakeTelemetry } from "./support/doubles/fake-telemetry.ts";

/** A two-message session with one project memory and its cost; `over` replaces a part. */
export function sessionExport(over: Partial<ExportInputs> = {}): ExportInputs {
  return {
    messages: [{ role: "user", content: "q" }, { role: "assistant", content: "a" }],
    memory: { project: ["remember this"] },
    cost: { totalTokens: 1234, costUsd: 0.05, calls: 3 },
    ...over,
  };
}

/** The fakes runExport reads and writes through, empty. */
export function exportDeps() {
  return { session: new FakeSessionStore(), telemetry: new FakeTelemetry(), memory: new FakeMemoryStore(), files: new FakeFiles() };
}
