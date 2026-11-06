// FakePromptConsole: the command context's `prompt` as the chooser adapter sees it. Every spec lands in `specs`, and
// `answer` is what it answers.
import type { PromptConsole } from "../../../src/shared/infrastructure/orkeon/chooser.ts";

type Spec = Parameters<PromptConsole["prompt"]>[0];

export class FakePromptConsole implements PromptConsole {
  interactive = true;
  answer: { value: string; control: string | null } | null = null;
  specs: Spec[] = [];

  async prompt(spec: Spec): Promise<{ value: string; control: string | null } | null> {
    this.specs.push(spec);
    return this.answer;
  }
}
