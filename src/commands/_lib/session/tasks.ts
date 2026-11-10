// /tasks (E-1, A-3) — the session task list, and the agent instances of the dev crews. The task
// list is one JSON array in the state bag (add, done, clear; /clear empties it). The instances are
// the children a dev crew runs (the reviewer of /dev-plan, the auditor of dev-verify): the crew
// writes its run in the state bag while they run (shared/application/agents/child-agent.ts), and
// reads there the stop /tasks leaves for one of them, at its next look. A send to a running instance
// is refused; to an ended one it is a repair by a new run (crews/agent-run), whose brief carries the
// previous report: the entry point launches it and its completion prints the answer. A repair runs
// at the effort /effort holds now. The list also shows the tool approvals the background tasks wait
// on (Orkeon #198), read from the host: a task blocked on the operator reads as such.

import type { PendingApproval, PendingApprovals, SessionStore } from "../../../shared/application/ports.ts";
import { readJsonArray, writeJson } from "../../../shared/application/session-state.ts";
import { TASKS_STATE_KEY } from "../../../shared/domain/session-keys.ts";
import {
  CHILD_CREWS, buildRepairBrief, describeInstance, instanceRows, locateInstance, parseRequest, parseSnapshot,
  requestKey, sendVerdict, settleSnapshot, snapshotKey, stopVerdict,
} from "../../../shared/domain/agents/instances.ts";
import type { InstanceRequest, Located, RunSnapshot } from "../../../shared/domain/agents/instances.ts";
import { storedEffort } from "../effort.ts";
import type { CommandView } from "../view.ts";
import {
  INSTANCE_VERBS, NO_TASKS, TASKS_ADD_USAGE, TASKS_SEND_USAGE, TASKS_USAGE, WAITING_FOR_APPROVAL, ANSWER_TEXT,
  repairByNewRun, repairWhileRunning, requestAlreadyWaiting, stopAsked, taskAdded, taskDone, tasksCleared,
  tasksDoneUsage, waitsForApproval,
} from "./messages.ts";
import { DEFAULT_REPAIR_NOTE } from "./prompts.ts";

/** The crew that repairs an instance by a new run. */
export const REPAIR_CREW = "agent-run";

export interface TasksDeps {
  session: Pick<SessionStore, "readState" | "writeState">;
  clock: () => Date;
  /** The tool approvals waiting for the operator, as the host shows them. */
  approvals: PendingApprovals;
}

/** What the entry point shows, and the crew it launches for a repair. */
export interface TasksOutcome {
  view: CommandView;
  launch?: { crew: string; input: Record<string, unknown>; details: Record<string, unknown> };
}

interface Task { subject: string; done: boolean }

async function readSnapshots({ session, clock }: TasksDeps): Promise<RunSnapshot[]> {
  const read = async (crew: string) => {
    try {
      const s = parseSnapshot(await session.readState(snapshotKey(crew)));
      return s === null ? null : settleSnapshot(s, clock());
    } catch {
      return null;
    }
  };
  return (await Promise.all(CHILD_CREWS.map(read))).filter((s): s is RunSnapshot => s !== null);
}

/** One approval as the list shows it: the task's ticket and command (the status line's words), the tool, the input. */
const approvalLine = (a: PendingApproval): string =>
  waitsForApproval(a.taskId === null ? "no task" : `${a.taskId} ${a.command ?? "?"}`, a.tool, a.input);

/** The approvals waiting, as lines; a host whose read fails shows none. */
function approvalLines({ approvals }: TasksDeps): string[] {
  try {
    return approvals.list().map(approvalLine);
  } catch {
    return [];
  }
}

async function list(tasks: Task[], deps: TasksDeps): Promise<TasksOutcome> {
  const rows = instanceRows(await readSnapshots(deps));
  const waiting = approvalLines(deps);
  const taskLines = tasks.map((t, i) => `#${i + 1} [${t.done ? "done" : "open"}] ${t.subject}`);
  if (rows.length === 0 && waiting.length === 0) {
    if (tasks.length === 0) return { view: { text: NO_TASKS } };
    return { view: { table: tasks.map((t, i) => ({ n: i + 1, status: t.done ? "done" : "open", subject: t.subject })) } };
  }
  const lines = [tasks.length === 0 ? "tasks: none" : "tasks:", ...taskLines];
  if (waiting.length > 0) lines.push(WAITING_FOR_APPROVAL, ...waiting);
  if (rows.length === 0) return { view: { lines, text: ANSWER_TEXT } };
  return {
    view: {
      lines: [...lines, "agent instances:"],
      table: rows,
      text: INSTANCE_VERBS,
    },
  };
}

const ref = (l: Located) => `${l.snapshot.crew}:${l.record.id}`;

async function locate(deps: TasksDeps, id: string | undefined): Promise<{ ok: true; found: Located } | { ok: false; view: CommandView }> {
  if (!id) return { ok: false, view: { text: TASKS_USAGE } };
  const located = locateInstance(await readSnapshots(deps), id);
  return located.ok ? located : { ok: false, view: { text: located.text } };
}

/** Leaves `request` for the crew, unless one of the same run it has not read yet is already there. */
async function leaveRequest(deps: TasksDeps, l: Located, request: InstanceRequest): Promise<string | null> {
  const key = requestKey(l.snapshot.crew, l.record.id);
  if (parseRequest(await deps.session.readState(key).catch(() => null))?.run === request.run) {
    return requestAlreadyWaiting(ref(l), l.record.id);
  }
  await deps.session.writeState(key, JSON.stringify(request));
  return null;
}

async function repair(deps: TasksDeps, l: Located, message: string): Promise<TasksOutcome> {
  return {
    view: {
      lines: [repairByNewRun(ref(l), l.record.charter)],
    },
    launch: {
      crew: REPAIR_CREW,
      input: {
        charter: l.record.charter, step: l.snapshot.step, system: l.record.system, brief: buildRepairBrief(l.record, message),
        effort: await storedEffort(deps.session),
      },
      details: { instance: ref(l), charter: l.record.charter },
    },
  };
}

/** `/tasks …` from the command's raw tokens. */
export async function runTasks(tokens: readonly string[], deps: TasksDeps): Promise<TasksOutcome> {
  const [sub, ...rest] = tokens;
  const tasks = (await readJsonArray(deps.session, TASKS_STATE_KEY)) as Task[];
  switch ((sub ?? "list").toLowerCase()) {
    case "list":
      return list(tasks, deps);
    case "add": {
      const subject = rest.join(" ");
      if (!subject) return { view: { text: TASKS_ADD_USAGE } };
      tasks.push({ subject, done: false });
      await writeJson(deps.session, TASKS_STATE_KEY, tasks);
      return { view: { text: taskAdded(tasks.length, subject) } };
    }
    case "done": {
      const n = Number(rest[0]);
      if (!Number.isInteger(n) || n < 1 || n > tasks.length) return { view: { text: tasksDoneUsage(tasks.length || 1) } };
      tasks[n - 1].done = true;
      await writeJson(deps.session, TASKS_STATE_KEY, tasks);
      return { view: { text: taskDone(n, tasks[n - 1].subject) } };
    }
    case "clear":
      await writeJson(deps.session, TASKS_STATE_KEY, []);
      return { view: { text: tasksCleared(tasks.length) } };
    case "show": {
      const l = await locate(deps, rest[0]);
      return l.ok ? { view: { lines: describeInstance(l.found) } } : { view: l.view };
    }
    case "stop": {
      const l = await locate(deps, rest[0]);
      if (!l.ok) return { view: l.view };
      const verdict = stopVerdict(l.found);
      if (!verdict.ok) return { view: { text: verdict.text } };
      const waiting = await leaveRequest(deps, l.found, { action: "stop", run: l.found.snapshot.startedAt, at: deps.clock().toISOString() });
      return { view: { text: waiting ?? stopAsked(ref(l.found)) } };
    }
    case "send": {
      const l = await locate(deps, rest[0]);
      if (!l.ok) return { view: l.view };
      const message = rest.slice(1).join(" ").trim();
      if (!message) return { view: { text: TASKS_SEND_USAGE } };
      const verdict = sendVerdict(l.found);
      if (verdict.kind === "refused") return { view: { text: verdict.text } };
      return repair(deps, l.found, message);
    }
    case "repair": {
      const l = await locate(deps, rest[0]);
      if (!l.ok) return { view: l.view };
      if (l.found.record.state === "running") {
        return { view: { text: repairWhileRunning(ref(l.found), l.found.record.id) } };
      }
      return repair(deps, l.found, rest.slice(1).join(" ").trim() || DEFAULT_REPAIR_NOTE);
    }
    default:
      return { view: { text: TASKS_USAGE } };
  }
}
