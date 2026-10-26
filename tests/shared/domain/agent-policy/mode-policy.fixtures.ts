// The values the mode policy table is checked against.
import type { ToolClass } from "../../../../src/shared/domain/agent-policy/mode-policy.ts";

/** The tool classes in catalogue order. */
export const CLASS_ORDER: readonly ToolClass[] = ["read", "network", "edit", "shell", "extra"];

/** Names no permission mode has: empty, unknown, another case, prototype keys. */
export const UNKNOWN_MODES: readonly string[] = ["", "yolo", "Plan", "constructor", "toString"];
