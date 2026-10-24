// One act of a role of the batch: its brief, its own tools (a subset of the crew agent's), its
// mode and the Llm built with its own callbacks (the role's deny rules). A failure of the act is
// a result, never thrown: the step stops on it with its reason.
import type { Llm } from "../../../shared/application/ports.ts";
import type { RoleSpec } from "../domain/roles.ts";

export type RoleAnswer = { ok: true; text: string } | { ok: false; reason: string };

export async function runRole(llm: Pick<Llm, "act">, role: RoleSpec, prompt: string): Promise<RoleAnswer> {
  try {
    const text = await llm.act(prompt, {
      system: role.system, maxIterations: role.maxIterations, tools: role.tools, permissionMode: "acceptEdits",
    });
    return { ok: true, text };
  } catch (e) {
    return { ok: false, reason: `${role.name}: ${String((e as Error)?.message ?? e).split("\n")[0]}` };
  }
}

/** One short question, no tool: the line a role left out of its answer. */
export async function askLine(llm: Pick<Llm, "act">, role: RoleSpec, question: string): Promise<RoleAnswer> {
  try {
    return { ok: true, text: await llm.act(question, { system: role.system, maxIterations: 1, tools: [], permissionMode: "acceptEdits" }) };
  } catch (e) {
    return { ok: false, reason: `${role.name}: ${String((e as Error)?.message ?? e).split("\n")[0]}` };
  }
}
