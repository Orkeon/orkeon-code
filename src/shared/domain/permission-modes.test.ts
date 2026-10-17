import { describe, it } from "node:test";
import { strictEqual, ok } from "node:assert";
import {
  PERMISSION_MODES, MODE_CYCLE, FALLBACK_PERMISSION_MODE,
  SANDBOX_FALLBACK_PERMISSION_MODE, PERMISSION_FALLBACK_CONFIG_KEY,
  isPermissionMode, getNextPermissionMode, resolveFallbackMode,
} from "./permission-modes.ts";

describe("permission-modes", () => {
  it("recognises every canonical mode", () => {
    for (const m of PERMISSION_MODES) strictEqual(isPermissionMode(m), true, m);
  });

  it("includes the dontAsk mode (E-3)", () => {
    strictEqual(isPermissionMode("dontAsk"), true);
  });

  it("rejects unknown, differently-cased, empty and nullish tokens", () => {
    strictEqual(isPermissionMode("yolo"), false);
    strictEqual(isPermissionMode("acceptedits"), false); // case-sensitive on purpose
    strictEqual(isPermissionMode("dontask"), false);
    strictEqual(isPermissionMode(""), false);
    strictEqual(isPermissionMode(null), false);
    strictEqual(isPermissionMode(undefined), false);
  });
});

describe("getNextPermissionMode (E-12)", () => {
  it("cycles default → acceptEdits → plan → bypassPermissions → default", () => {
    strictEqual(getNextPermissionMode("default"), "acceptEdits");
    strictEqual(getNextPermissionMode("acceptEdits"), "plan");
    strictEqual(getNextPermissionMode("plan"), "bypassPermissions");
    strictEqual(getNextPermissionMode("bypassPermissions"), "default");
  });

  it("keeps dontAsk off the cycle (explicit /mode dontAsk only)", () => {
    strictEqual(MODE_CYCLE.includes("dontAsk" as any), false);
    strictEqual(getNextPermissionMode("dontAsk"), "default");
  });

  it("re-enters at default from unknown modes", () => {
    strictEqual(getNextPermissionMode("yolo"), "default");
    strictEqual(getNextPermissionMode(""), "default");
  });
});

// ── B-2: the fallback is a decision surface, not a silent constant ───────
//
// Exp07 fell back to `bypassPermissions` on a sandbox-as-boundary rationale
// (commit 238c20c) while the original runs `default` and asks on writes
// (baseline 08 §4). The rationale is not overruled here — it is made visible and
// opt-in, because an operator reading `/permissions` could not previously tell
// that their un-configured session was bypassing every approval.

describe("resolveFallbackMode (B-2)", () => {
  it("ACCEPTANCE 1 — an un-configured session resolves to 'default', like the original", () => {
    for (const absent of [undefined, null, "", "   "]) {
      const r = resolveFallbackMode(absent);
      strictEqual(r.mode, "default", String(absent));
      strictEqual(r.source, "built-in");
    }
    strictEqual(FALLBACK_PERMISSION_MODE, "default");
  });

  it("names its source, so /permissions can print WHERE the mode came from", () => {
    const built = resolveFallbackMode(undefined);
    ok(built.explanation.includes("built-in"), built.explanation);
    ok(built.explanation.includes(PERMISSION_FALLBACK_CONFIG_KEY), built.explanation);
  });

  it("honours the opt-in sandboxed posture, and says what it means", () => {
    const r = resolveFallbackMode(SANDBOX_FALLBACK_PERMISSION_MODE);
    strictEqual(r.mode, "bypassPermissions");
    strictEqual(r.source, "config");
    ok(r.explanation.includes("sandboxed posture"), r.explanation);
  });

  it("accepts any canonical mode as the configured fallback", () => {
    for (const m of PERMISSION_MODES) {
      const r = resolveFallbackMode(m);
      strictEqual(r.mode, m, m);
      strictEqual(r.source, "config", m);
    }
  });

  it("REJECTS an unknown value loudly instead of silently ignoring it", () => {
    // Silently ignoring is how an operator ends up believing they tightened a
    // session they did not. It must fall back to the built-in AND say so.
    const r = resolveFallbackMode("yolo");
    strictEqual(r.mode, FALLBACK_PERMISSION_MODE);
    strictEqual(r.source, "config-invalid");
    strictEqual(r.rejected, "yolo");
    ok(r.explanation.includes("IGNORED"), r.explanation);
    ok(r.explanation.includes("yolo"), r.explanation);
  });

  it("rejects a differently-cased mode — the vocabulary is case-sensitive everywhere", () => {
    strictEqual(resolveFallbackMode("bypasspermissions").source, "config-invalid");
  });

  it("trims, so a configured value with whitespace still selects its mode", () => {
    strictEqual(resolveFallbackMode("  plan  ").mode, "plan");
  });

  it("never resolves to a non-mode, whatever it is given", () => {
    for (const junk of [42, {}, [], true, () => {}]) {
      ok(isPermissionMode(resolveFallbackMode(junk as any).mode), String(junk));
    }
  });
});

describe("B-2 does not weaken the explicit selectors (ACCEPTANCE 2)", () => {
  it("keeps bypassPermissions selectable by /mode and by a prompt prefix", () => {
    // Both paths go through isPermissionMode, independent of the fallback: the
    // policy change must not make the bypass unreachable for those who want it.
    strictEqual(isPermissionMode("bypassPermissions"), true);
    strictEqual(SANDBOX_FALLBACK_PERMISSION_MODE, "bypassPermissions");
  });

  it("keeps bypassPermissions on the /mode cycle", () => {
    strictEqual(MODE_CYCLE.includes("bypassPermissions" as any), true);
    strictEqual(getNextPermissionMode("plan"), "bypassPermissions");
  });
});
