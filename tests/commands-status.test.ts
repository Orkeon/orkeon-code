// /status (commands/_lib/status.ts): the rows the baseline names, and runStatus
// over the fakes. Run:
//   node --test tests/commands-status.test.ts
import { describe, it } from "node:test";
import { strictEqual, ok, deepStrictEqual } from "node:assert";

import { buildStatusRows, PLATFORM_COMMAND } from "../src/commands/_lib/status.ts";
import { cacheColumns, statsRow } from "../src/commands/_lib/cache.ts";
import { ORKEON_RUNTIME_VERSION } from "../src/commands/_lib/meta.ts";
import { readHostProvider } from "../src/shared/infrastructure/orkeon/host-provider.ts";
import { FakeShell } from "./support/fake-shell.ts";
import { CACHE_COLUMN_CASES, PROVIDER_CASES, rowMap, statusHarness } from "./commands-status.fixtures.ts";
import { WORKSPACE } from "../src/shared/domain/vfs.ts";

describe("/status — buildStatusRows", () => {
  it("carries the four fields the baseline names", () => {
    // Arrange
    // model, cost, workspace, crew summary — the pre-B-11 table had none of the
    // first, second or fourth.
    const inputs = { model: "kimi-k3", costUsd: 0.42, crews: ["main-loop", "advisor"] };

    // Act
    const r = rowMap(buildStatusRows(inputs));

    // Assert
    strictEqual(r.get("model"), "kimi-k3");
    strictEqual(r.get("workspace"), WORKSPACE);
    strictEqual(r.get("cost"), "$0.4200");
    strictEqual(r.get("crews"), "advisor, main-loop");
  });

  it("says the model is UNREPORTED rather than '?'", () => {
    // Arrange
    // An absence with a cause, not an unknown value — the distinction is what
    // cost a debugging round today.
    const inputs = {};

    // Act
    const r = rowMap(buildStatusRows(inputs));

    // Assert
    ok(r.get("model")!.includes("unreported by the host"));
  });

  it("shows the context as a percentage when the window is known", () => {
    // Arrange
    const inputs = { usedTokens: 50, windowTokens: 200 };

    // Act
    const r = rowMap(buildStatusRows(inputs));

    // Assert
    ok(r.get("context")!.includes("25% of 200"));
  });

  it("omits the percentage rather than dividing by zero", () => {
    // Arrange
    const inputs = { usedTokens: 50, windowTokens: 0 };

    // Act
    const r = rowMap(buildStatusRows(inputs));

    // Assert
    strictEqual(r.get("context"), "50 tokens");
  });

  it("degrades every field independently", () => {
    // Arrange
    const inputs = {};

    // Act
    const r = rowMap(buildStatusRows(inputs));

    // Assert
    strictEqual(r.get("messages"), "0");
    strictEqual(r.get("cost"), "$0.0000");
    strictEqual(r.get("crews"), "(none discovered)");
  });
});

describe("/status — runStatus", () => {
  it("tables the rows from the metadata, the cost, the budget and the crews", async () => {
    // Arrange
    const { session, telemetry, crews, run } = statusHarness();
    telemetry.metadata = { model: "kimi-k3", title: "parser", messageCount: 4 };
    telemetry.cost = { totalTokens: 900, costUsd: 0.5, totalCalls: 2 };
    session.budget = { used: 500, window: 1000 };
    crews.crews = ["main-loop"];

    // Act
    const view = await run();

    // Assert
    deepStrictEqual(view, {
      table: buildStatusRows({
        model: "kimi-k3", title: "parser", messages: 4, usedTokens: 500, windowTokens: 1000,
        totalTokens: 900, costUsd: 0.5, calls: 2, crews: ["main-loop"], workspace: WORKSPACE,
      }),
    });
  });

  it("degrades a row when its read fails", async () => {
    // Arrange
    const { session, telemetry, run } = statusHarness();
    telemetry.failure = new Error("no session tools");
    session.failure = new Error("no session tools");

    // Act
    const view = await run();

    // Assert
    deepStrictEqual(view, { table: buildStatusRows({ crews: [], workspace: WORKSPACE }) });
  });

  it("falls back to the statistics when the metadata is absent", async () => {
    // Arrange
    const { session, telemetry, run } = statusHarness();
    session.failure = new Error("no session tools");
    telemetry.stats = { messageCount: 7, totalTokens: 30, totalCalls: 1 };

    // Act
    const view = await run();

    // Assert
    const rows = rowMap(view.table);
    strictEqual(rows.get("messages"), "7");
    strictEqual(rows.get("llm"), "1 call(s), 30 token(s)");
  });
});

describe("/status — what /version, /env, /session and /upgrade showed", () => {
  it("carries the version, the platform and how to update", () => {
    // Arrange
    const inputs = { platform: "linux  x64  node v24.21.0\n" };

    // Act
    const r = rowMap(buildStatusRows(inputs));

    // Assert
    ok(r.get("version")!.startsWith("orkeon-code "));
    strictEqual(r.get("platform"), "linux  x64  node v24.21.0");
    ok(r.get("updates")!.includes("no self-update"));
  });

  it("says the platform is unavailable when none is given", () => {
    // Arrange
    const inputs = {};

    // Act
    const r = rowMap(buildStatusRows(inputs));

    // Assert
    strictEqual(r.get("platform"), "(unavailable)");
  });

  it("reads the platform through the shell", async () => {
    // Arrange
    const shell = new FakeShell();
    shell.results[PLATFORM_COMMAND] = { stdout: "linux  x64  node v24\n" };
    const { run } = statusHarness({ shell });

    // Act
    const view = await run();

    // Assert
    strictEqual(rowMap(view.table).get("platform"), "linux  x64  node v24");
  });

  it("degrades the platform row alone when the shell refuses", async () => {
    // Arrange
    const shell = new FakeShell();
    shell.results[PLATFORM_COMMAND] = { stdout: "linux  x64  node v24\n" };
    shell.errors[PLATFORM_COMMAND] = new Error("refused");
    const { run } = statusHarness({ shell });

    // Act
    const view = await run();

    // Assert
    strictEqual(rowMap(view.table).get("platform"), "(unavailable)");
  });
});

describe("/status — the runtime and the provider (A-4a)", () => {
  it("names the pinned runtime", () => {
    // Arrange
    const inputs = {};

    // Act
    const r = rowMap(buildStatusRows(inputs));

    // Assert
    strictEqual(r.get("runtime"), `Orkeon ${ORKEON_RUNTIME_VERSION} (pinned by .orkeon-version)`);
  });

  it("names the provider", () => {
    // Arrange
    const inputs = { provider: "deepseek" };

    // Act
    const r = rowMap(buildStatusRows(inputs));

    // Assert
    strictEqual(r.get("provider"), "deepseek (the host's default)");
  });

  it("names the absence of a provider", () => {
    // Arrange
    const inputs = {};

    // Act
    const r = rowMap(buildStatusRows(inputs));

    // Assert
    strictEqual(r.get("provider"), "(unreported by the host)");
  });

  it("reads the provider through its reader", async () => {
    // Arrange
    const { run } = statusHarness({ provider: () => "anthropic" });

    // Act
    const view = await run();

    // Assert
    strictEqual(rowMap(view.table).get("provider"), "anthropic (the host's default)");
  });

  for (const c of PROVIDER_CASES) {
    it(`readHostProvider ${c.name}`, () => {
      // Arrange
      const { services } = c;

      // Act
      const provider = readHostProvider(services);

      // Assert
      strictEqual(provider, c.expected);
    });
  }
});

describe("/usage and /context — the cache columns (A-4a)", () => {
  for (const c of CACHE_COLUMN_CASES) {
    it(c.name, () => {
      // Arrange
      const { stats } = c;

      // Act
      const columns = cacheColumns(stats);

      // Assert
      deepStrictEqual(columns, c.expected);
    });
  }
});

describe("/stats — the cache columns of /usage (A-4a)", () => {
  it("shows the read and the write tokens, and the share read from the cache", () => {
    // Arrange
    const stats = { messageCount: 3, estimatedTokens: 900, costUsd: 0.01, totalTokens: 1000, totalCalls: 2, cacheHitTokens: 700, cacheWriteTokens: 50 };

    // Act
    const row = statsRow(stats);

    // Assert
    deepStrictEqual(row, {
      messages: 3, estTokens: 900, costUsd: 0.01, tokens: 1000, calls: 2, cacheRead: 700, cacheWrite: 50, cacheRatio: "0.70",
    });
  });

  it("shows `-` for what the host does not report", () => {
    // Arrange
    const stats = {};

    // Act
    const row = statsRow(stats);

    // Assert
    deepStrictEqual(row, {
      messages: 0, estTokens: 0, costUsd: 0, tokens: 0, calls: 0, cacheRead: "-", cacheWrite: "-", cacheRatio: "-",
    });
  });
});
