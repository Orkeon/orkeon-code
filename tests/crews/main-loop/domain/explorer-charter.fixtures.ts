// The sessions explorerReachable judges: a mode and its rules, and whether a spawn of the explorer gets through.
import type { PermissionRule } from "../../../../src/shared/domain/agent-policy/permission.ts";

export interface ReachableCase {
  name: string;
  mode: string;
  rules: readonly PermissionRule[];
  reachable: boolean;
}

export const REACHABLE_CASES: readonly ReachableCase[] = [
  { name: "is reachable in default, where spawn_agent is asked about", mode: "default", rules: [], reachable: true },
  { name: "is reachable in acceptEdits", mode: "acceptEdits", rules: [], reachable: true },
  { name: "is not reachable in plan, which refuses spawn_agent", mode: "plan", rules: [], reachable: false },
  { name: "is not reachable in dontAsk without an allow rule", mode: "dontAsk", rules: [], reachable: false },
  {
    name: "is reachable in dontAsk under an allow rule on spawn_agent",
    mode: "dontAsk",
    rules: [{ effect: "allow", tool: "spawn_agent" }],
    reachable: true,
  },
  {
    name: "is reachable in dontAsk under an allow rule on the explorer's name",
    mode: "dontAsk",
    rules: [{ effect: "allow", tool: "spawn_agent", argument: "agent", pattern: "explorer" }],
    reachable: true,
  },
  {
    name: "is not reachable in plan under an allow rule, which plan's gate never reads",
    mode: "plan",
    rules: [{ effect: "allow", tool: "spawn_agent" }],
    reachable: false,
  },
  {
    name: "is not reachable in default under a deny rule on spawn_agent",
    mode: "default",
    rules: [{ effect: "deny", tool: "spawn_agent" }],
    reachable: false,
  },
  {
    name: "is not reachable in bypassPermissions under a deny rule on the explorer's name",
    mode: "bypassPermissions",
    rules: [{ effect: "deny", tool: "spawn_agent", argument: "agent", pattern: "expl*" }],
    reachable: false,
  },
  {
    name: "stays reachable in default under a deny rule on some briefs only",
    mode: "default",
    rules: [{ effect: "deny", tool: "spawn_agent", argument: "input", pattern: "*secret*" }],
    reachable: true,
  },
  {
    name: "stays reachable in default under a deny rule on file_write",
    mode: "default",
    rules: [{ effect: "deny", tool: "file_write" }],
    reachable: true,
  },
];
