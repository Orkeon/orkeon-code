// /status (commands/_lib/status.ts): the rows the baseline names, and runStatus
// over the fakes. Run:
//   node --test tests/commands-status.test.ts
import { describe, it } from "node:test";
import { strictEqual, ok, deepStrictEqual } from "node:assert";

import { buildStatusRows, runStatus, PLATFORM_COMMAND } from "../src/commands/_lib/status.ts";
import { cacheColumns } from "../src/commands/_lib/cache.ts";
import { ORKEON_RUNTIME_VERSION } from "../src/commands/_lib/meta.ts";
import { readHostProvider } from "../src/shared/infrastructure/orkeon/host-provider.ts";
import { FakeShell } from "./support/fake-shell.ts";
import { FakeCrewHost } from "./support/fake-crew-host.ts";
import { FakeSessionStore } from "./support/fake-session-store.ts";
import { FakeTelemetry } from "./support/fake-telemetry.ts";

describe("/status — buildStatusRows", () => {
  const rows = (o: any = {}) => new Map(buildStatusRows(o).map((r) => [r.field, r.value]));

  it("carries the four fields the baseline names", () => {
    // model, cost, workspace, crew summary — the pre-B-11 table had none of the
    // first, second or fourth.
    const r = rows({ model: "kimi-k3", costUsd: 0.42, crews: ["main-loop", "advisor"] });
    strictEqual(r.get("model"), "kimi-k3");
    strictEqual(r.get("workspace"), "/workspace");
    strictEqual(r.get("cost"), "$0.4200");
    strictEqual(r.get("crews"), "advisor, main-loop");
  });

  it("says the model is UNREPORTED rather than '?'", () => {
    // An absence with a cause, not an unknown value — the distinction is what
    // cost a debugging round today.
    ok(rows().get("model")!.includes("unreported by the host"));
  });

  it("shows the context as a percentage when the window is known", () => {
    ok(rows({ usedTokens: 50, windowTokens: 200 }).get("context")!.includes("25% of 200"));
  });

  it("omits the percentage rather than dividing by zero", () => {
    strictEqual(rows({ usedTokens: 50, windowTokens: 0 }).get("context"), "50 tokens");
  });

  it("degrades every field independently", () => {
    const r = rows({});
    strictEqual(r.get("messages"), "0");
    strictEqual(r.get("cost"), "$0.0000");
    strictEqual(r.get("crews"), "(none discovered)");
  });
});

describe("/status — runStatus", () => {
  function setup() {
    const session = new FakeSessionStore();
    const telemetry = new FakeTelemetry();
    const crews = new FakeCrewHost();
    return { session, telemetry, crews, run: () => runStatus({ session, telemetry, crews }) };
  }

  it("tables the rows from the metadata, the cost, the budget and the crews", async () => {
    const { session, telemetry, crews, run } = setup();
    telemetry.metadata = { model: "kimi-k3", title: "parser", messageCount: 4 };
    telemetry.cost = { totalTokens: 900, costUsd: 0.5, totalCalls: 2 };
    session.budget = { used: 500, window: 1000 };
    crews.crews = ["main-loop"];
    deepStrictEqual(await run(), {
      table: buildStatusRows({
        model: "kimi-k3", title: "parser", messages: 4, usedTokens: 500, windowTokens: 1000,
        totalTokens: 900, costUsd: 0.5, calls: 2, crews: ["main-loop"], workspace: "/workspace",
      }),
    });
  });

  it("falls back to the statistics, and degrades a row when its read fails", async () => {
    const { session, telemetry, run } = setup();
    telemetry.failure = new Error("no session tools");
    session.failure = new Error("no session tools");
    deepStrictEqual(await run(), { table: buildStatusRows({ crews: [], workspace: "/workspace" }) });
    telemetry.failure = null;
    telemetry.stats = { messageCount: 7, totalTokens: 30, totalCalls: 1 };
    const rows = new Map((await run()).table!.map((r: any) => [r.field, r.value]));
    strictEqual(rows.get("messages"), "7");
    strictEqual(rows.get("llm"), "1 call(s), 30 token(s)");
  });
});

describe("/status — what /version, /env, /session and /upgrade showed", () => {
  const rows = (o: any = {}) => new Map(buildStatusRows(o).map((r) => [r.field, r.value]));
  it("carries the version, the platform and how to update", () => {
    const r = rows({ platform: "linux  x64  node v24.21.0\n" });
    ok(r.get("version")!.startsWith("orkeon-code "));
    strictEqual(r.get("platform"), "linux  x64  node v24.21.0");
    ok(r.get("updates")!.includes("no self-update"));
    strictEqual(rows().get("platform"), "(unavailable)");
  });
  it("reads the platform through the shell, and degrades that row alone", async () => {
    const shell = new FakeShell();
    shell.results[PLATFORM_COMMAND] = { stdout: "linux  x64  node v24\n" };
    const deps = { session: new FakeSessionStore(), telemetry: new FakeTelemetry(), crews: new FakeCrewHost(), shell };
    const view = await runStatus(deps);
    const table = new Map((view.table as Array<{ field: string; value: string }>).map((r) => [r.field, r.value]));
    strictEqual(table.get("platform"), "linux  x64  node v24");
    shell.errors[PLATFORM_COMMAND] = new Error("refused");
    const degraded = new Map(((await runStatus(deps)).table as Array<{ field: string; value: string }>).map((r) => [r.field, r.value]));
    strictEqual(degraded.get("platform"), "(unavailable)");
  });
});

describe("/status — the runtime and the provider (A-4a)", () => {
  const rows = (o: any = {}) => new Map(buildStatusRows(o).map((r) => [r.field, r.value]));

  it("names the pinned runtime, and the provider or its absence", () => {
    strictEqual(rows().get("runtime"), `Orkeon ${ORKEON_RUNTIME_VERSION} (pinned by .orkeon-version)`);
    strictEqual(rows({ provider: "deepseek" }).get("provider"), "deepseek (the host's default)");
    strictEqual(rows().get("provider"), "(unreported by the host)");
  });

  it("reads the provider through its reader", async () => {
    const deps = {
      session: new FakeSessionStore(), telemetry: new FakeTelemetry(), crews: new FakeCrewHost(), provider: () => "anthropic",
    };
    const table = new Map(((await runStatus(deps)).table as Array<{ field: string; value: string }>).map((r) => [r.field, r.value]));
    strictEqual(table.get("provider"), "anthropic (the host's default)");
  });

  it("reads the llm service's CLR Name, and nothing when the host wires none or the read throws", () => {
    const services = (llm: unknown, has = true) => ({ has: () => has, get: <T>() => llm as T });
    strictEqual(readHostProvider(services({ Name: "deepseek" })), "deepseek");
    strictEqual(readHostProvider(services({ name: " OpenAI " })), "OpenAI");
    strictEqual(readHostProvider(services({ Name: "" })), undefined);
    strictEqual(readHostProvider(services({ Name: "x" }, false)), undefined);
    strictEqual(readHostProvider({ has: () => true, get: () => { throw new Error("not whitelisted"); } }), undefined);
  });
});

describe("/usage and /context — the cache columns (A-4a)", () => {
  it("shows the read and write tokens, `-` when unreported", () => {
    deepStrictEqual(cacheColumns({ cacheHitTokens: 700, cacheWriteTokens: 50 }), { cacheRead: 700, cacheWrite: 50 });
    deepStrictEqual(cacheColumns({ cacheHitTokens: 0, cacheWriteTokens: 0 }), { cacheRead: 0, cacheWrite: 0 });
    deepStrictEqual(cacheColumns({}), { cacheRead: "-", cacheWrite: "-" });
  });
});
