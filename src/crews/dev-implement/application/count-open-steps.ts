// The open steps of the batch sheet a /dev-implement run will take, counted before the crew starts so
// that its budget is sized to them (implement-budget.ts). Undefined when the sheet cannot be found or
// read: the crew then sizes for the default, and its own run says what is wrong.
import type { Files, Shell } from "../../../shared/application/ports.ts";
import type { ConfigStore } from "../../../shared/application/config-store.ts";
import { loadDevContext } from "../../../shared/application/dev/load-dev-context.ts";
import { openSteps, parseImplementSheet } from "../domain/step-section.ts";
import { locateSheet } from "./locate-sheet.ts";
import { WORKSPACE } from "../../../shared/domain/vfs.ts";

export async function countOpenSteps(
  deps: { files: Files; shell: Shell; config: Pick<ConfigStore, "readValue"> },
  batch: string, plan: string | null,
): Promise<number | undefined> {
  try {
    const context = await loadDevContext(deps);
    const located = await locateSheet(deps.files, context.work.folder, batch, plan);
    if (typeof located === "string") return undefined;
    const sheet = parseImplementSheet(await deps.files.read(`${WORKSPACE}/${located.dir}/${located.name}`));
    return sheet.problems.length > 0 ? undefined : openSteps(sheet).length;
  } catch {
    return undefined;
  }
}
