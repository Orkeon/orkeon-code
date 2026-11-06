// The human-input port: a question to the person at the terminal.
// Types only, re-exported by ../ports.ts.

/** A question to the person at the terminal (`human_input`). Each call says whether a person answered: an
 *  unattended host answers on nobody's behalf, and that answer is never taken (`answered: false`). */
export interface HumanInput {
  /** One of `options`, the first one recommended; `value` is the option picked. */
  choice(prompt: string, options: readonly string[]): Promise<{ answered: true; value: string } | { answered: false }>;
  /** Free text; an empty answer is no answer. */
  text(prompt: string): Promise<{ answered: true; value: string } | { answered: false }>;
  /** Several of `options`, none recommended: the options picked, in the order given. */
  multi(prompt: string, options: readonly string[]): Promise<{ answered: true; values: string[] } | { answered: false }>;
}

/** One option of a `Chooser` question. */
export interface ChoiceOption {
  value: string;
  label?: string;
  /** Aligned in a column after the label. */
  description?: string;
  /** The value in force, marked in the list and selected on opening. */
  current?: boolean;
}

export interface ChoiceQuestion {
  message: string;
  options: readonly ChoiceOption[];
  /** A second value, adjusted with the side arrows while an option is selected. */
  control?: { label: string; values: readonly string[]; value: string };
}

/** A choice made in the console's own panel, for a command typed at the prompt. Unlike `HumanInput`, which a crew's
 *  tool call goes through, it can be left: `null` is the person leaving, and nothing is to change. */
export interface Chooser {
  /** False on a replay or a plain console: the command keeps its behaviour without a panel. */
  readonly interactive: boolean;
  choose(question: ChoiceQuestion): Promise<{ value: string; control: string | null } | null>;
}
