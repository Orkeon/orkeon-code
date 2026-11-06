// The Chooser port over the command context's `prompt`: a `select` panel, answered in detail.
import type { Chooser } from "../../application/ports.ts";

/** The part of the command context a choice goes through. */
export interface PromptConsole {
  readonly interactive: boolean;
  prompt(spec: {
    type: "select";
    message: string;
    choices: readonly { value: string; label?: string; description?: string; current?: boolean }[];
    control?: { label: string; values: readonly string[]; value?: string };
    detailed: true;
  }): Promise<{ readonly value: string; readonly control: string | null } | null>;
}

export function createChooser(console: PromptConsole): Chooser {
  return {
    get interactive() {
      return console.interactive;
    },
    choose: async ({ message, options, control }) => {
      const answer = await console.prompt({
        type: "select",
        message,
        choices: options,
        ...(control ? { control } : {}),
        detailed: true,
      });
      return answer ? { value: answer.value, control: answer.control ?? null } : null;
    },
  };
}
