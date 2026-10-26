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
