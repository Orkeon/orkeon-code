// /tasks (E-1, A-3) — the session task list, and the agent instances of the dev crews. The task
// list is one JSON array in the state bag (add, done, clear; /clear empties it). The instances are
// the children a dev crew runs (the reviewer of /dev-plan, the auditor of /dev-verify): the crew
// writes its run in the state bag while they run (shared/application/agents/child-agent.ts), and
// reads there what /tasks asks of one of them. A stop or a send in place waits for the crew to read
// it; a send to an instance whose run no longer answers is a repair by a new run (crews/agent-run),
// whose brief carries the previous report: the entry point launches it and its completion prints
// the answer.

import type { SessionStore } from "../../shared/application/ports.ts";
import { readJsonArray, writeJson } from "../../shared/application/session-state.ts";
import { TASKS_STATE_KEY } from "../../shared/domain/session-keys.ts";
import {
  CHILD_CREWS, buildRepairBrief, describeInstance, instanceRows, locateInstance, parseRequest, parseSnapshot,
  requestKey, sendVerdict, snapshotKey, stopVerdict,
} from "../../shared/domain/agents/instances.ts";
import type { Located, RunSnapshot } from "../../shared/domain/agents/instances.ts";
import type { CommandView } from "./view.ts";

export const TASKS_USAGE =
  "usage: /tasks [list | add <subject> | done <n> | clear | show <id> | stop <id> | send <id> <message> | repair <id> [note]]";

/** The note a repair carries when the operator gives none. */
export const DEFAULT_REPAIR_NOTE = "Check your previous report against the brief again and correct what is wrong or missing.";

/** The crew that repairs an instance by a new run. */
export const REPAIR_CREW = "agent-run";

export interface TasksDeps {
  session: Pick<SessionStore, "readState" | "writeState">;
  clock: () => Date;
}

/** What the entry point shows, and the crew it launches for a repair. */
export interface TasksOutcome {
  view: CommandView;
  launch?: { crew: string; input: Record<string, unknown>; details: Record<string, unknown> };
}

interface Task { subject: string; done: boolean }

async function readSnapshots(session: TasksDeps["session"]): Promise<RunSnapshot[]> {
  const read = async (crew: string) => {
    try {
      return parseSnapshot(await session.readState(snapshotKey(crew)));
    } catch {
      return null;
    }
  };
  return (await Promise.all(CHILD_CREWS.map(read))).filter((s): s is RunSnapshot => s !== null);
}

async function list(tasks: Task[], deps: TasksDeps): Promise<TasksOutcome> {
  const rows = instanceRows(await readSnapshots(deps.session));
  const taskLines = tasks.map((t, i) => `#${i + 1} [${t.done ? "done" : "open"}] ${t.subject}`);
  if (rows.length === 0) {
    if (tasks.length === 0) return { view: { text: "no tasks and no agent instances. usage: /tasks add <subject>" } };
    return { view: { table: tasks.map((t, i) => ({ n: i + 1, status: t.done ? "done" : "open", subject: t.subject })) } };
  }
  return {
    view: {
      lines: [tasks.length === 0 ? "tasks: none" : "tasks:", ...taskLines, "agent instances:"],
      table: rows,
      text: "/tasks show <id> · stop <id> · send <id> <message> · repair <id> [note]",
    },
  };
}

const ref = (l: Located) => `${l.snapshot.crew}:${l.record.id}`;

async function locate(deps: TasksDeps, id: string | undefined): Promise<{ ok: true; found: Located } | { ok: false; view: CommandView }> {
  if (!id) return { ok: false, view: { text: TASKS_USAGE } };
  const located = locateInstance(await readSnapshots(deps.session), id);
  return located.ok ? located : { ok: false, view: { text: located.text } };
}

/** Leaves `request` for the crew, unless one it has not read yet is already there. */
async function leaveRequest(deps: TasksDeps, l: Located, request: object): Promise<string | null> {
  const key = requestKey(l.snapshot.crew, l.record.id);
  if (parseRequest(await deps.session.readState(key).catch(() => null)) !== null) {
    return `${ref(l)}: a request the crew has not read yet is already waiting; /tasks show ${l.record.id} once it has`;
  }
  await deps.session.writeState(key, JSON.stringify(request));
  return null;
}

function repair(l: Located, message: string): TasksOutcome {
  return {
    view: {
      lines: [`${ref(l)}: its run no longer answers; a new run of ${l.record.charter} repairs it, with the previous report in its brief (not its live context).`],
    },
    launch: {
      crew: REPAIR_CREW,
      input: {
        charter: l.record.charter, system: l.record.system, brief: buildRepairBrief(l.record, message),
        effort: l.record.effort ?? null,
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
      if (!subject) return { view: { text: "usage: /tasks add <subject>" } };
      tasks.push({ subject, done: false });
      await writeJson(deps.session, TASKS_STATE_KEY, tasks);
      return { view: { text: `task #${tasks.length} added: ${subject}` } };
    }
    case "done": {
      const n = Number(rest[0]);
      if (!Number.isInteger(n) || n < 1 || n > tasks.length) return { view: { text: `usage: /tasks done <1-${tasks.length || 1}>` } };
      tasks[n - 1].done = true;
      await writeJson(deps.session, TASKS_STATE_KEY, tasks);
      return { view: { text: `task #${n} done: ${tasks[n - 1].subject}` } };
    }
    case "clear":
      await writeJson(deps.session, TASKS_STATE_KEY, []);
      return { view: { text: `task list cleared (${tasks.length} removed).` } };
    case "show": {
      const l = await locate(deps, rest[0]);
      return l.ok ? { view: { lines: describeInstance(l.found) } } : { view: l.view };
    }
    case "stop": {
      const l = await locate(deps, rest[0]);
      if (!l.ok) return { view: l.view };
      const verdict = stopVerdict(l.found);
      if (!verdict.ok) return { view: { text: verdict.text } };
      const waiting = await leaveRequest(deps, l.found, { action: "stop", at: deps.clock().toISOString() });
      return { view: { text: waiting ?? `stop asked for ${ref(l.found)}: the crew ends it at its next look (about a second); /tasks shows it` } };
    }
    case "send": {
      const l = await locate(deps, rest[0]);
      if (!l.ok) return { view: l.view };
      const message = rest.slice(1).join(" ").trim();
      if (!message) return { view: { text: "usage: /tasks send <id> <message>" } };
      const verdict = sendVerdict(l.found);
      if (verdict.kind === "refused") return { view: { text: verdict.text } };
      if (verdict.kind === "repair") return repair(l.found, message);
      const waiting = await leaveRequest(deps, l.found, { action: "send", message, at: deps.clock().toISOString() });
      return { view: { text: waiting ?? `sent to ${ref(l.found)}: the crew passes it on at its next look; /tasks show ${l.found.record.id} prints the answer` } };
    }
    case "repair": {
      const l = await locate(deps, rest[0]);
      if (!l.ok) return { view: l.view };
      if (l.found.record.state === "running") {
        return { view: { text: `${ref(l.found)} is running: a repair is for an ended instance (/tasks stop ${l.found.record.id} first)` } };
      }
      return repair(l.found, rest.slice(1).join(" ").trim() || DEFAULT_REPAIR_NOTE);
    }
    default:
      return { view: { text: TASKS_USAGE } };
  }
}
