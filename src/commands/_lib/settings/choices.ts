// The options of a panel from plain values.
import type { ChoiceOption } from "../../../shared/application/ports.ts";

/** One option per value, the one in force marked: a model's name matches whatever its case. */
export function optionsOf(values: readonly string[], current: string): ChoiceOption[] {
  const active = current.toLowerCase();
  return values.map((value) => (value.toLowerCase() === active ? { value, current: true } : { value }));
}
