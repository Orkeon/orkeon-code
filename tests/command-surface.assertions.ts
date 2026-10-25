// Checks on the command surface.
import { match, ok, strictEqual } from "node:assert";
import type { Cmd, ExportLine } from "./command-surface.fixtures.ts";

/** Each command file declares exactly one name literal. */
export function assertOneNameEach(cmds: readonly Cmd[]): void {
  for (const c of cmds) strictEqual(c.names.length, 1, `${c.file}: expected exactly one name literal, found ${c.names.length}`);
}

/** No name or alias is declared twice (loader ValidateGlobalUniqueness). */
export function assertNoNameConflict(cmds: readonly Cmd[]): void {
  const seen = new Map<string, string>();
  for (const c of cmds) {
    for (const n of [c.name, ...c.aliases]) {
      ok(!seen.has(n), `duplicate command name '${n}' in ${c.file} and ${seen.get(n)}`);
      seen.set(n, c.file);
    }
  }
}

/** Each alias of `expected` is owned by the command it names. */
export function assertAliasesOf(owner: ReadonlyMap<string, string>, expected: readonly (readonly [string, string])[]): void {
  for (const [alias, name] of expected) strictEqual(owner.get(alias), name, `/${alias} must stay an alias of /${name}`);
}

/** Every name matches the loader's kebab-case rule. */
export function assertKebabNames(cmds: readonly Cmd[]): void {
  for (const c of cmds) match(c.name, /^[a-z][a-z0-9-]*$/, `${c.file}: '${c.name}'`);
}

/** Every file slug is the name the file declares. */
export function assertSlugsMatchNames(cmds: readonly Cmd[]): void {
  for (const c of cmds) strictEqual(c.file.replace(/\.cmd\.ts$/, ""), c.name, `${c.file} declares '${c.name}'`);
}

/** Every command of `expected` is among `names`; `wave` names the wave in the message. */
export function assertCommandsPresent(names: ReadonlySet<string>, expected: readonly string[], wave: string): void {
  for (const n of expected) ok(names.has(n), `missing ${wave} command: ${n}`);
}

/** No command file holds a top-level export. */
export function assertNoTopLevelExport(found: readonly { file: string; offenders: readonly ExportLine[] }[]): void {
  for (const { file, offenders } of found) {
    strictEqual(
      offenders.length, 0,
      `${file} has a top-level export at line ${offenders[0]?.n} (${offenders[0]?.line}) — ` +
      "Jint evaluates command files in script mode and will refuse to load it",
    );
  }
}
