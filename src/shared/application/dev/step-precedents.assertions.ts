// Checks on the precedents block and the warnings of a recall.
import { ok } from "node:assert";

/** `block` is a Precedents section naming every id of `names` and none of `omits`. */
export function assertPrecedentsBlock(block: string, names: readonly string[], omits: readonly string[]): void {
  ok(block.startsWith("## Precedents\n"), `not a Precedents section:\n${block}`);
  for (const id of names) ok(block.includes(id), `${id} is not named in:\n${block}`);
  for (const id of omits) ok(!block.includes(id), `${id} should not be named in:\n${block}`);
}

/** One warning of `lines` mentions every text of `mentions` and none of `omits`. */
export function assertWarning(lines: readonly string[], mentions: readonly string[], omits: readonly string[]): void {
  ok(lines.some((w) => w.startsWith("warn: ") && mentions.every((m) => w.includes(m)) && omits.every((o) => !w.includes(o))),
    `no warning mentions ${mentions.join(", ")} without ${omits.join(", ")}:\n${lines.join("\n")}`);
}
