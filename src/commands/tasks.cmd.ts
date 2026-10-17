/// <reference path="./.orkeon/orkeon-cli.d.ts" />
// /tasks (E-1) — session task list (baseline 04 §/tasks): add/list/done/clear
// over one JSON array in the state bag. Survives /assistant runs; cleared by
// /reset-session (or `/tasks clear`).
import { rawTokens } from "./_lib/args.ts";
import { readJsonArray, writeJson } from "../shared/application/session-state.ts";
import { orkeonSessionIo } from "../shared/infrastructure/orkeon/wiring.ts";
import { TASKS_STATE_KEY } from "../shared/domain/session-keys.ts";

const session = orkeonSessionIo();

defineCommand({
  name: "tasks",
  description: "Manage the session task list: add, list, done, clear.",
  handler: async (args, ctx) => {
    const [sub, ...rest] = rawTokens(args);
    const tasks = (await readJsonArray(session, TASKS_STATE_KEY)) as any[];
    switch ((sub ?? "list").toLowerCase()) {
      case "list":
        if (tasks.length === 0) return ctx.continue("no tasks. usage: /tasks add <subject>");
        ctx.table(tasks.map((t: any, i: number) => ({ n: i + 1, status: t.done ? "done" : "open", subject: t.subject })));
        return ctx.continue();
      case "add": {
        const subject = rest.join(" ");
        if (!subject) return ctx.continue("usage: /tasks add <subject>");
        tasks.push({ subject, done: false });
        await writeJson(session, TASKS_STATE_KEY, tasks);
        return ctx.continue(`task #${tasks.length} added: ${subject}`);
      }
      case "done": {
        const n = Number(rest[0]);
        if (!Number.isInteger(n) || n < 1 || n > tasks.length)
          return ctx.continue(`usage: /tasks done <1-${tasks.length || 1}>`);
        tasks[n - 1].done = true;
        await writeJson(session, TASKS_STATE_KEY, tasks);
        return ctx.continue(`task #${n} done: ${tasks[n - 1].subject}`);
      }
      case "clear":
        await writeJson(session, TASKS_STATE_KEY, []);
        return ctx.continue(`task list cleared (${tasks.length} removed).`);
      default:
        return ctx.continue("usage: /tasks [list|add <subject>|done <n>|clear]");
    }
  },
});
