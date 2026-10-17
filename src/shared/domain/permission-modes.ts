// Canonical permission-mode list — pure, no IO. Single source shared by the
// /mode + /assistant commands (prefix parsing) and the main-loop crew (session
// default resolution). Mirrors the modes understood by the C# ModePermissionGate.
//
// Run tests: node_modules/.bin/tsx --test shared/domain/permission-modes.test.ts

// `dontAsk` (E-3): the 5th external mode of the original — denies every write
// fail-closed WITHOUT asking. Catalogue-wise it is read-only like `plan`; the
// C# gate additionally classifies unknown/never-ask modes fail-closed.
export const PERMISSION_MODES = ["default", "acceptEdits", "bypassPermissions", "plan", "dontAsk"] as const;
export type PermissionMode = (typeof PERMISSION_MODES)[number];

// ── Session fallback (B-2) ──────────────────────────────────────────────
// The mode that applies when neither the prompt ("mode:" prefix) nor /mode set
// one. It used to be the constant `bypassPermissions`, on a sandbox-as-boundary
// rationale (commit 238c20c) — the single most consequential declared deviation
// from the original, which runs `default` and asks on writes (baseline 08 §4).
//
// The point of B-2 is NOT to overrule that rationale. It is to stop it being a
// silent constant: an operator reading `/permissions` could not tell that their
// un-configured session was bypassing every approval, because nothing said so.
// So the default now matches the original, and the sandboxed posture is an
// explicit opt-in that names itself in the output.

/** Fallback with no configuration — matches the original (asks on writes). */
export const FALLBACK_PERMISSION_MODE = "default";

/** Fallback selected by the opt-in config key; the pre-B-2 behaviour. */
export const SANDBOX_FALLBACK_PERMISSION_MODE = "bypassPermissions";

/** `/config permissions.fallback <mode>` — the opt-in key, read from the config map. */
export const PERMISSION_FALLBACK_CONFIG_KEY = "permissions.fallback";

/** Where the effective fallback came from. Reported by /permissions. */
export type FallbackSource = "built-in" | "config" | "config-invalid";

export interface FallbackResolution {
  /** The mode to apply. Always a valid permission mode. */
  mode: string;
  source: FallbackSource;
  /** One line naming the source — what /permissions prints. */
  explanation: string;
  /** The rejected value, when `source` is "config-invalid". */
  rejected?: string;
}

/**
 * Resolves the session fallback from the configured value. PURE — the caller
 * reads the config map and passes what it found.
 *
 * A configured value that is not a permission mode is NOT silently ignored:
 * that is how an operator ends up believing they tightened a session they did
 * not. It resolves to the built-in and says the value was rejected.
 */
export function resolveFallbackMode(configured: unknown): FallbackResolution {
  const raw = typeof configured === "string" ? configured.trim() : "";
  if (raw.length === 0) {
    return {
      mode: FALLBACK_PERMISSION_MODE,
      source: "built-in",
      explanation:
        `built-in default '${FALLBACK_PERMISSION_MODE}' (asks on writes, like the original) — ` +
        `set '${PERMISSION_FALLBACK_CONFIG_KEY}' to change it`,
    };
  }
  if (!isPermissionMode(raw)) {
    return {
      mode: FALLBACK_PERMISSION_MODE,
      source: "config-invalid",
      rejected: raw,
      explanation:
        `'${PERMISSION_FALLBACK_CONFIG_KEY}' is '${raw}', which is not a permission mode — ` +
        `IGNORED, running the built-in '${FALLBACK_PERMISSION_MODE}'. ` +
        `Expected one of: ${PERMISSION_MODES.join(", ")}`,
    };
  }
  return {
    mode: raw,
    source: "config",
    explanation:
      `'${PERMISSION_FALLBACK_CONFIG_KEY}' = '${raw}'` +
      (raw === SANDBOX_FALLBACK_PERMISSION_MODE
        ? " — sandboxed posture: the container/VFS is the security boundary, approvals never stall a session"
        : ""),
  };
}

/** True when the token is one of the known permission modes (case-sensitive). */
export function isPermissionMode(token: unknown): boolean {
  return PERMISSION_MODES.includes(String(token ?? "") as any);
}

// ── Mode-transition state machine (E-12) ────────────────────────────────
// Cycle order mirrors the original's Shift+Tab rotation (baseline 08
// §Modes and transitions). `dontAsk` is reachable only by explicit
// `/mode dontAsk` — the original excludes it from the cycle too.
export const MODE_CYCLE = ["default", "acceptEdits", "plan", "bypassPermissions"] as const;

/** The next mode in the cycle; unknown/off-cycle modes re-enter at "default". */
export function getNextPermissionMode(current: string): string {
  const idx = MODE_CYCLE.indexOf(current as any);
  return idx < 0 ? "default" : MODE_CYCLE[(idx + 1) % MODE_CYCLE.length];
}
