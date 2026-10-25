// The checkouts the project-init reads are tested over.
import { FakeFiles } from "../../../../tests/support/fake-files.ts";
import { WORKSPACE } from "../../../shared/domain/vfs.ts";

/** A checkout with `count` top-level entries. */
export function checkoutWithEntries(count: number): FakeFiles {
  const files = new FakeFiles();
  files.listings.set(WORKSPACE, Array.from({ length: count }, (_, i) => `f${i}`));
  return files;
}

/** A checkout with a short package.json and a go.mod of 5 000 characters. */
export function checkoutWithConfigs(): FakeFiles {
  const files = new FakeFiles();
  files.files.set(`${WORKSPACE}/package.json`, "{}");
  files.files.set(`${WORKSPACE}/go.mod`, "m".repeat(5000));
  return files;
}

/** A checkout with a .cursorrules, a CLAUDE.md and a blank AGENTS.md. */
export function checkoutWithInstructions(): FakeFiles {
  const files = new FakeFiles();
  files.files.set(`${WORKSPACE}/.cursorrules`, "tabs\n");
  files.files.set(`${WORKSPACE}/CLAUDE.md`, "pnpm\n");
  files.files.set(`${WORKSPACE}/AGENTS.md`, "  \n");
  return files;
}
