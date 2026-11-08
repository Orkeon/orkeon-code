// launch.json files as the launcher writes them, over FakeFiles.
import { HOST_LAYOUT_FILE_PATH } from "../../../src/shared/application/host-layout-store.ts";
import type { HostLayoutRead } from "../../../src/shared/application/host-layout-store.ts";
import { IDENTITY_HOST } from "../../../src/shared/domain/host-layout.ts";
import { FakeFiles } from "../../support/doubles/fake-files.ts";

/** A WSL start, two mounts. */
export const WSL_FILE = JSON.stringify({
  version: 1, flavour: "wsl", mode: "tool", wsl: { distro: "Ubuntu", automountRoot: "/mnt" },
  mounts: { "/workspace": { posix: "/mnt/c/x", windows: "C:\\x" }, "/output": { posix: "/home/me/out", windows: null } },
});

export const WSL_READ: HostLayoutRead = {
  layout: { flavour: "wsl", distro: "Ubuntu", automountRoot: "/mnt", mounts: [{ virtual: "/workspace", posix: "/mnt/c/x", windows: "C:\\x" }, { virtual: "/output", posix: "/home/me/out" }] },
  problems: [],
  malformed: false,
};

export const IDENTITY_READ: HostLayoutRead = { layout: IDENTITY_HOST, problems: [], malformed: false };

export interface ReadCase { name: string; files: (files: FakeFiles) => void; expected: HostLayoutRead }

export const READ_CASES: readonly ReadCase[] = [
  { name: "an absent file is the identity", files: () => {}, expected: IDENTITY_READ },
  { name: "an empty file is the identity", files: (f) => f.files.set(HOST_LAYOUT_FILE_PATH, " \n"), expected: IDENTITY_READ },
  { name: "a file that cannot be read is the identity", files: (f) => f.readErrors.set(HOST_LAYOUT_FILE_PATH, new Error("Access denied")), expected: IDENTITY_READ },
  {
    name: "a file that is not JSON is malformed and the identity",
    files: (f) => f.files.set(HOST_LAYOUT_FILE_PATH, "{ version: 1"),
    expected: { layout: IDENTITY_HOST, problems: [`${HOST_LAYOUT_FILE_PATH} is not JSON: no host layout applies`], malformed: true },
  },
  { name: "a WSL file is its layout", files: (f) => f.files.set(HOST_LAYOUT_FILE_PATH, WSL_FILE), expected: WSL_READ },
  {
    name: "a file with a bad mount keeps the others and names it",
    files: (f) => f.files.set(HOST_LAYOUT_FILE_PATH, JSON.stringify({ version: 1, flavour: "posix", mounts: { "/workspace": { posix: "/home/me/x" }, "out": { posix: "/a" } } })),
    expected: { layout: { flavour: "posix", automountRoot: "/mnt", mounts: [{ virtual: "/workspace", posix: "/home/me/x" }] }, problems: ["launch.json mount 'out' is not a mount point"], malformed: false },
  },
  {
    name: "a file of another version is the identity, named",
    files: (f) => f.files.set(HOST_LAYOUT_FILE_PATH, JSON.stringify({ version: 2, flavour: "wsl", mounts: {} })),
    expected: { layout: IDENTITY_HOST, problems: ["launch.json version 2 is not 1"], malformed: false },
  },
];
