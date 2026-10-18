// FakeLlm: the Llm port answering canned replies, in order, the last one repeating:
// `answers` for act(), `completions` for complete(), `extractions` for extract().
// An Error reply is thrown, as a failing provider (or an unparsable extraction)
// throws. Every call lands in `acts`, `completes` or `extracts` with the prompt
// and the settings it received. `gateEnabled` is what the host says of its gate.
import type { ActRequest, CompleteRequest, Llm } from "../../src/shared/application/ports.ts";

function reply<T>(replies: readonly T[], index: number): T {
  const value = replies[Math.min(index, replies.length - 1)];
  if (value instanceof Error) throw value;
  return value;
}

export class FakeLlm implements Llm {
  answers: Array<string | Error> = [""];
  completions: Array<string | Error> = [""];
  extractions: unknown[] = [{}];
  acts: Array<{ prompt: string; request: ActRequest }> = [];
  completes: Array<{ prompt: string; override?: CompleteRequest }> = [];
  extracts: Array<{ prompt: string; schema: object }> = [];
  gateEnabled: boolean | undefined = true;

  permissionGateEnabled(): boolean | undefined {
    return this.gateEnabled;
  }

  async act(prompt: string, request: ActRequest): Promise<string> {
    this.acts.push({ prompt, request });
    return reply(this.answers, this.acts.length - 1) as string;
  }

  async complete(prompt: string, override?: CompleteRequest): Promise<string> {
    this.completes.push({ prompt, override });
    return reply(this.completions, this.completes.length - 1) as string;
  }

  async extract(prompt: string, schema: object): Promise<unknown> {
    this.extracts.push({ prompt, schema });
    return reply(this.extractions, this.extracts.length - 1);
  }
}
