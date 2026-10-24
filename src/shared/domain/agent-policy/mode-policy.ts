// What each permission mode offers the model, one row per mode — pure, no IO.
// The main-loop catalogue (permission.ts), /commit's refusal
// (crews/git-commit/domain/commit.ts) and /mode's announcement all read this
// table, so a mode's policy is stated once: a new mode is an entry of
// PERMISSION_MODES and a row here.

import { isPermissionMode } from "../permission-modes.ts";
import type { PermissionMode } from "../permission-modes.ts";

/**
 * The classes of tools a mode can hand the model, in catalogue order. `extra` is
 * the extra tools of access class `write` (the `tools.extra` setting: an MCP
 * server's or a plugin's tools); an extra tool of class `read` joins `read`.
 */
export type ToolClass = "read" | "network" | "edit" | "shell" | "extra";

export interface ModePolicy {
  /** The turn changes nothing observable: local reads only, no edit, no shell, no network. */
  readOnly: boolean;
  /** The tool classes the model is given, in catalogue order. */
  toolClasses: readonly ToolClass[];
}

export const MODE_POLICIES: Readonly<Record<PermissionMode, ModePolicy>> = {
  // The writing modes offer every class; the host gate decides what asks. In
  // `default` it asks before every call that is not a read, in `acceptEdits`
  // before every call that is neither a read nor a file edit (the shell, the
  // network tools, `github` and `rag_eval`, which declare no access), and
  // `bypassPermissions` never asks.
  default: { readOnly: false, toolClasses: ["read", "network", "edit", "shell", "extra"] },
  acceptEdits: { readOnly: false, toolClasses: ["read", "network", "edit", "shell", "extra"] },
  bypassPermissions: { readOnly: false, toolClasses: ["read", "network", "edit", "shell", "extra"] },
  // `plan` inspects only; `dontAsk` (E-3) denies writes without asking. Both get
  // the local read tools only: network reads are withheld too (B-8) because
  // these modes promise that the turn changes nothing observable, and an outbound
  // request is observable elsewhere — it can leak the repository's contents to a
  // third party and it can trigger a side effect on the far end. An extra tool
  // the user did not mark `read` is withheld for the same reason.
  plan: { readOnly: true, toolClasses: ["read"] },
  dontAsk: { readOnly: true, toolClasses: ["read"] },
};

/**
 * The policy of a mode. An unknown mode gets `default`'s: the catalogue degrades
 * to the permissive default (the C# gate classifies unknown modes fail-closed).
 */
export function policyFor(mode: string): ModePolicy {
  return isPermissionMode(mode) ? MODE_POLICIES[mode as PermissionMode] : MODE_POLICIES.default;
}
