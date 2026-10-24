// What a close needs to open the pull request itself: the github tool, the session's mode and rules. Read at
// a dev command's dispatch; the crew keeps it (the batch record, the /dev-batches run record) for the close the
// chain launches from `completed`, which is synchronous and cannot read the session's mode again. Not a
// command file: the loader reads *.cmd.ts only. The entry point hands the ports, each made when read: a host
// without the service fails there, and that read says nothing.
import type { SessionIo } from "../../shared/application/session-io.ts";
import { GITHUB_TOOL } from "../../shared/domain/git/pull-request.ts";
import { policyFor } from "../../shared/domain/agent-policy/mode-policy.ts";

export interface PullRequestContext { githubTool: boolean; permissionRules: string[]; permissionMode: string }

export interface PullRequestContextPorts {
  catalogue: () => { find(name: string): unknown };
  rules: () => { available(): boolean; list(): string[] };
  session: Pick<SessionIo, "resolveEffectiveSessionMode">;
}

export async function readPullRequestContext(ports: PullRequestContextPorts): Promise<PullRequestContext> {
  let githubTool = false;
  let permissionRules: string[] = [];
  let permissionMode = "";
  try {
    githubTool = ports.catalogue().find(GITHUB_TOOL) !== undefined;
  } catch { /* no tools service: the command is handed over */ }
  try {
    const rules = ports.rules();
    if (rules.available()) permissionRules = rules.list();
  } catch { /* no rules service: none */ }
  try {
    permissionMode = (await ports.session.resolveEffectiveSessionMode()).mode;
  } catch { /* unknown mode: the opener refuses and hands the command over */ }
  return { githubTool, permissionRules, permissionMode };
}

/** The refusal of a command that writes files, commits and pushes (`/dev-implement`, `/dev-batches`) in a read-only
 *  session mode, or in one that cannot be read: an unknown mode fails closed. Null when the command may run. */
export function writingModeRefusal(mode: string, command: string): string | null {
  const what = `${command} writes files, commits and pushes: /mode default, then run it again`;
  if (mode === "") return `✗ refused: the session mode cannot be read, and ${what}`;
  return policyFor(mode).readOnly ? `✗ refused: the session mode ${mode} is read-only, and ${what}` : null;
}
