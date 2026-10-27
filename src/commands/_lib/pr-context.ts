// What a close needs to open the pull request itself: the github tool, the session's mode and rules. Read at
// a dev command's dispatch, and again by its `completed` before each hop that writes (Orkeon #220: the host awaits
// an async `completed`); the crew keeps the dispatch's reading (the batch record, the /dev-batches run record) for
// a typed close and for the hop whose read failed. Not a command file: the loader reads *.cmd.ts only. The entry point hands the ports, each made when read: a host
// without the service fails there, and that read says nothing.
import type { SessionIo } from "../../shared/application/session-io.ts";
import { GITHUB_TOOL } from "../../shared/domain/git/pull-request.ts";

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
  } catch { /* unknown mode, "": the opener refuses and hands the command over, and writeModeRefusal (dev-step.ts) refuses the step */ }
  return { githubTool, permissionRules, permissionMode };
}
