// launch.json documents as the launchers write them, and the layouts they parse to.
import type { HostLayout } from "../../../src/shared/domain/host-layout.ts";

/** A WSL start, the bases written with the variations the launcher may produce (a trailing separator, a lower-cased
 *  drive, `/` in a Windows spelling, `/mnt/C`). */
export const WSL_DOCUMENT = {
  version: 1, flavour: "wsl", mode: "tool",
  wsl: { distro: "Ubuntu", automountRoot: "/mnt/" },
  mounts: {
    "/workspace": { posix: "/mnt/C/ici est/mon repertoire/", windows: "c:/ici est/mon repertoire/" },
    "/output": { posix: "/home/me/.orkeon-code/projects/x/output", windows: "\\\\wsl.localhost\\Ubuntu\\home\\me\\.orkeon-code\\projects\\x\\output\\" },
  },
};

export const WSL_PARSED: HostLayout = {
  flavour: "wsl", distro: "Ubuntu", automountRoot: "/mnt",
  mounts: [
    { virtual: "/workspace", posix: "/mnt/c/ici est/mon repertoire", windows: "C:\\ici est\\mon repertoire" },
    { virtual: "/output", posix: "/home/me/.orkeon-code/projects/x/output", windows: "\\\\wsl.localhost\\Ubuntu\\home\\me\\.orkeon-code\\projects\\x\\output" },
  ],
};

export interface ParseCase { name: string; raw: unknown; layout: HostLayout; problems: readonly string[] }

const IDENTITY: HostLayout = { flavour: "posix", automountRoot: "/mnt", mounts: [] };

export const PARSE_CASES: readonly ParseCase[] = [
  { name: "a WSL document, each base normalised", raw: WSL_DOCUMENT, layout: WSL_PARSED, problems: [] },
  {
    name: "a native Windows document, a drive root kept as C:\\",
    raw: { version: 1, flavour: "windows", mounts: { "/workspace": { windows: "C:" }, "/output": { windows: "D:/" }, "/tmp": { windows: "E:\\tmp\\" } } },
    layout: { flavour: "windows", automountRoot: "/mnt", mounts: [{ virtual: "/workspace", windows: "C:\\" }, { virtual: "/output", windows: "D:\\" }, { virtual: "/tmp", windows: "E:\\tmp" }] },
    problems: [],
  },
  {
    name: "a posix document without a wsl block",
    raw: { version: 1, flavour: "posix", mode: "tool", mounts: { "/workspace": { posix: "/home/me/x" } } },
    layout: { flavour: "posix", automountRoot: "/mnt", mounts: [{ virtual: "/workspace", posix: "/home/me/x" }] },
    problems: [],
  },
  {
    name: "a docker start: posix, no mount",
    raw: { version: 1, flavour: "posix", mode: "docker", mounts: {} },
    layout: IDENTITY,
    problems: [],
  },
  {
    name: "WSL without wslpath: a null windows spelling is no spelling",
    raw: { version: 1, flavour: "wsl", wsl: { distro: "Ubuntu" }, mounts: { "/workspace": { posix: "/mnt/c/x", windows: null } } },
    layout: { flavour: "wsl", distro: "Ubuntu", automountRoot: "/mnt", mounts: [{ virtual: "/workspace", posix: "/mnt/c/x" }] },
    problems: [],
  },
  {
    name: "WSL with another automount root",
    raw: { version: 1, flavour: "wsl", wsl: { distro: "Ubuntu", automountRoot: "/" }, mounts: { "/workspace": { posix: "/C/x" } } },
    layout: { flavour: "wsl", distro: "Ubuntu", automountRoot: "/", mounts: [{ virtual: "/workspace", posix: "/c/x" }] },
    problems: [],
  },
  { name: "not an object", raw: "x", layout: IDENTITY, problems: ["launch.json is not an object"] },
  { name: "null", raw: null, layout: IDENTITY, problems: ["launch.json is not an object"] },
  { name: "another version", raw: { version: 2, flavour: "wsl", mounts: {} }, layout: IDENTITY, problems: ["launch.json version 2 is not 1"] },
  { name: "no version", raw: { flavour: "wsl", mounts: {} }, layout: IDENTITY, problems: ["launch.json version undefined is not 1"] },
  { name: "an unknown flavour", raw: { version: 1, flavour: "cygwin", mounts: {} }, layout: IDENTITY, problems: ["launch.json flavour 'cygwin' is not posix, wsl or windows"] },
  {
    name: "mounts that are not an object",
    raw: { version: 1, flavour: "posix", mounts: [] },
    layout: IDENTITY,
    problems: ["launch.json mounts is not an object"],
  },
  {
    name: "a mount key that is not a mount point, dropped; the others kept",
    raw: { version: 1, flavour: "posix", mounts: { "workspace": { posix: "/a" }, "/out/put": { posix: "/b" }, "/output": { posix: "/c" } } },
    layout: { flavour: "posix", automountRoot: "/mnt", mounts: [{ virtual: "/output", posix: "/c" }] },
    problems: ["launch.json mount 'workspace' is not a mount point", "launch.json mount '/out/put' is not a mount point"],
  },
  {
    name: "a mount without bases, dropped",
    raw: { version: 1, flavour: "posix", mounts: { "/workspace": "x", "/output": {} } },
    layout: IDENTITY,
    problems: ["launch.json mount '/workspace' has no bases", "launch.json mount '/output' has no usable base"],
  },
  {
    name: "a relative posix base and a relative windows base, each named",
    raw: { version: 1, flavour: "wsl", mounts: { "/workspace": { posix: "x/y", windows: "foo\\bar" }, "/output": { posix: "/a", windows: "foo" } } },
    layout: { flavour: "wsl", automountRoot: "/mnt", mounts: [{ virtual: "/output", posix: "/a" }] },
    problems: [
      "launch.json mount '/workspace': posix base 'x/y' is not an absolute path",
      "launch.json mount '/workspace': windows base 'foo\\bar' is not a drive or UNC path",
      "launch.json mount '/output': windows base 'foo' is not a drive or UNC path",
    ],
  },
];
