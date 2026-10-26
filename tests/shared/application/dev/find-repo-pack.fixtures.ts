// The files the repository pack lookup is tested on.
import { FakeFiles } from "../../../support/doubles/fake-files.ts";
import { HARNESS_PACKS_DIR, ORKEON_PACK_PATH } from "../../../../src/shared/application/dev/find-repo-pack.ts";

/** The repo.yaml of the harness pack `name`. */
export const harnessPack = (name: string): string => `${HARNESS_PACKS_DIR}/${name}/references/repo.yaml`;

/** FakeFiles (every path read in `reads`) holding `orkeonPack` as .orkeon/repo.yaml (none when null) beside a harness pack repo-x. */
export function besideHarnessPack(orkeonPack: string | null): FakeFiles {
  const files = new FakeFiles();
  if (orkeonPack !== null) files.files.set(ORKEON_PACK_PATH, orkeonPack);
  files.listings.set(HARNESS_PACKS_DIR, ["repo-x"]);
  files.files.set(harnessPack("repo-x"), "layout:\n  work: harness/tasks\n");
  return files;
}
