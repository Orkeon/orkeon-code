import { describe, it } from "node:test";
import { strictEqual, ok } from "node:assert";
import {
  PERMISSION_MODES, MODE_CYCLE, FALLBACK_PERMISSION_MODE,
  SANDBOX_FALLBACK_PERMISSION_MODE, PERMISSION_FALLBACK_CONFIG_KEY,
  isPermissionMode, getNextPermissionMode, resolveFallbackMode,
} from "../../../src/shared/domain/permission-modes.ts";
import { ABSENT_FALLBACKS, CYCLE_STEPS, JUNK_FALLBACKS, NOT_MODES, UNKNOWN_MODES } from "./permission-modes.fixtures.ts";
import { assertMentions } from "../../support/assertions/text.ts";

describe("permission-modes", () => {
  for (const m of PERMISSION_MODES) {
    it(`recognises every canonical mode: ${m}`, () => {
      // Arrange
      const token = m;

      // Act
      const known = isPermissionMode(token);

      // Assert
      strictEqual(known, true, m);
    });
  }

  it("includes the dontAsk mode (E-3)", () => {
    // Arrange
    const token = "dontAsk";

    // Act
    const known = isPermissionMode(token);

    // Assert
    strictEqual(known, true);
  });

  for (const c of NOT_MODES) {
    it(`rejects unknown, differently-cased, empty and nullish tokens: ${c.name}`, () => {
      // Arrange
      const { token } = c;

      // Act
      const known = isPermissionMode(token);

      // Assert
      strictEqual(known, false);
    });
  }
});

describe("getNextPermissionMode (E-12)", () => {
  for (const c of CYCLE_STEPS) {
    it(`cycles default → acceptEdits → plan → bypassPermissions → default: ${c.from} → ${c.to}`, () => {
      // Arrange
      const current = c.from;

      // Act
      const next = getNextPermissionMode(current);

      // Assert
      strictEqual(next, c.to);
    });
  }

  it("keeps dontAsk off the cycle (explicit /mode dontAsk only)", () => {
    // Arrange
    const cycle: readonly string[] = MODE_CYCLE;

    // Act
    const onCycle = cycle.includes("dontAsk");

    // Assert
    strictEqual(onCycle, false);
  });

  it("re-enters at default from dontAsk", () => {
    // Arrange
    const current = "dontAsk";

    // Act
    const next = getNextPermissionMode(current);

    // Assert
    strictEqual(next, "default");
  });

  for (const mode of UNKNOWN_MODES) {
    it(`re-enters at default from unknown modes: ${JSON.stringify(mode)}`, () => {
      // Arrange
      const current = mode;

      // Act
      const next = getNextPermissionMode(current);

      // Assert
      strictEqual(next, "default");
    });
  }
});

// ── B-2: the fallback is a decision surface, not a silent constant ───────
//
// Exp07 fell back to `bypassPermissions` on a sandbox-as-boundary rationale
// (commit 238c20c) while the original runs `default` and asks on writes
// (baseline 08 §4). The rationale is not overruled here — it is made visible and
// opt-in, because an operator reading `/permissions` could not previously tell
// that their un-configured session was bypassing every approval.

describe("resolveFallbackMode (B-2)", () => {
  for (const absent of ABSENT_FALLBACKS) {
    it(`ACCEPTANCE 1 — an un-configured session resolves to 'default', like the original: ${JSON.stringify(absent) ?? "undefined"}`, () => {
      // Arrange
      const configured = absent;

      // Act
      const r = resolveFallbackMode(configured);

      // Assert
      strictEqual(r.mode, "default", String(absent));
      strictEqual(r.source, "built-in");
    });
  }

  it("ACCEPTANCE 1 — the built-in fallback is 'default'", () => {
    // Arrange
    const expected = "default";

    // Act
    const fallback = FALLBACK_PERMISSION_MODE;

    // Assert
    strictEqual(fallback, expected);
  });

  it("names its source, so /permissions can print WHERE the mode came from", () => {
    // Arrange
    const configured = undefined;

    // Act
    const built = resolveFallbackMode(configured);

    // Assert
    assertMentions(built.explanation, ["built-in", PERMISSION_FALLBACK_CONFIG_KEY]);
  });

  it("honours the opt-in sandboxed posture, and says what it means", () => {
    // Arrange
    const configured = SANDBOX_FALLBACK_PERMISSION_MODE;

    // Act
    const r = resolveFallbackMode(configured);

    // Assert
    strictEqual(r.mode, "bypassPermissions");
    strictEqual(r.source, "config");
    assertMentions(r.explanation, ["sandboxed posture"]);
  });

  for (const m of PERMISSION_MODES) {
    it(`accepts any canonical mode as the configured fallback: ${m}`, () => {
      // Arrange
      const configured = m;

      // Act
      const r = resolveFallbackMode(configured);

      // Assert
      strictEqual(r.mode, m, m);
      strictEqual(r.source, "config", m);
    });
  }

  it("REJECTS an unknown value loudly instead of silently ignoring it", () => {
    // Silently ignoring is how an operator ends up believing they tightened a
    // session they did not. It must fall back to the built-in AND say so.
    // Arrange
    const configured = "yolo";

    // Act
    const r = resolveFallbackMode(configured);

    // Assert
    strictEqual(r.mode, FALLBACK_PERMISSION_MODE);
    strictEqual(r.source, "config-invalid");
    strictEqual(r.rejected, "yolo");
    assertMentions(r.explanation, ["IGNORED", "yolo"]);
  });

  it("rejects a differently-cased mode — the vocabulary is case-sensitive everywhere", () => {
    // Arrange
    const configured = "bypasspermissions";

    // Act
    const r = resolveFallbackMode(configured);

    // Assert
    strictEqual(r.source, "config-invalid");
  });

  it("trims, so a configured value with whitespace still selects its mode", () => {
    // Arrange
    const configured = "  plan  ";

    // Act
    const r = resolveFallbackMode(configured);

    // Assert
    strictEqual(r.mode, "plan");
  });

  for (const c of JUNK_FALLBACKS) {
    it(`never resolves to a non-mode, whatever it is given: ${c.name}`, () => {
      // Arrange
      const { value } = c;

      // Act
      const r = resolveFallbackMode(value);

      // Assert
      ok(isPermissionMode(r.mode), String(value));
    });
  }
});

describe("B-2 does not weaken the explicit selectors (ACCEPTANCE 2)", () => {
  it("keeps bypassPermissions selectable by /mode and by a prompt prefix", () => {
    // Both paths go through isPermissionMode, independent of the fallback: the
    // policy change must not make the bypass unreachable for those who want it.
    // Arrange
    const token = "bypassPermissions";

    // Act
    const known = isPermissionMode(token);

    // Assert
    strictEqual(known, true);
  });

  it("names bypassPermissions as the sandboxed fallback", () => {
    // Arrange
    const expected = "bypassPermissions";

    // Act
    const sandboxed = SANDBOX_FALLBACK_PERMISSION_MODE;

    // Assert
    strictEqual(sandboxed, expected);
  });

  it("keeps bypassPermissions on the /mode cycle", () => {
    // Arrange
    const cycle: readonly string[] = MODE_CYCLE;

    // Act
    const onCycle = cycle.includes("bypassPermissions");

    // Assert
    strictEqual(onCycle, true);
  });

  it("reaches bypassPermissions on the /mode cycle from plan", () => {
    // Arrange
    const current = "plan";

    // Act
    const next = getNextPermissionMode(current);

    // Assert
    strictEqual(next, "bypassPermissions");
  });
});
