// The files a run reads its host context from: launch.json, the user settings and the project file, over FakeFiles.
import { CONFIG_FILE_PATH, USER_CONFIG_FILE_PATH, createConfigStore } from "../../../src/shared/application/config-store.ts";
import { HOST_LAYOUT_FILE_PATH } from "../../../src/shared/application/host-layout-store.ts";
import type { HostContextRead } from "../../../src/shared/application/host-context.ts";
import { IDENTITY_HOST } from "../../../src/shared/domain/host-layout.ts";
import type { HostLayout } from "../../../src/shared/domain/host-layout.ts";
import { FakeFiles } from "../../support/doubles/fake-files.ts";
import { FakeSessionStore } from "../../support/doubles/fake-session-store.ts";

/** FakeFiles holding the given files, and the config store over them. */
export function hostHarness(contents: Record<string, string> = {}) {
  const files = new FakeFiles();
  for (const [path, content] of Object.entries(contents)) files.files.set(path, content);
  return { files, config: createConfigStore({ files, session: new FakeSessionStore() }) };
}

export const WINDOWS_FILE = JSON.stringify({
  version: 1, flavour: "windows", mounts: { "/workspace": { windows: "C:\\proj" }, "/output": { windows: "C:\\Users\\me\\.orkeon-code\\projects\\x\\output" } },
});

export const WINDOWS_LAYOUT: HostLayout = {
  flavour: "windows", automountRoot: "/mnt",
  mounts: [{ virtual: "/workspace", windows: "C:\\proj" }, { virtual: "/output", windows: "C:\\Users\\me\\.orkeon-code\\projects\\x\\output" }],
};

export interface ContextCase { name: string; contents: Record<string, string>; expected: HostContextRead }

export const CONTEXT_CASES: readonly ContextCase[] = [
  { name: "no file at all is the identity context", contents: {}, expected: { layout: IDENTITY_HOST, lists: { deny: [], allow: [] }, problems: [], malformed: false } },
  {
    name: "the layout, the user's lists and the project's over them, each entry canonical for that host",
    contents: {
      [HOST_LAYOUT_FILE_PATH]: WINDOWS_FILE,
      [USER_CONFIG_FILE_PATH]: JSON.stringify({ "paths.deny": "C:\\proj\\secrets", "paths.allow": "/workspace" }),
      [CONFIG_FILE_PATH]: JSON.stringify({ "paths.deny": "keys", "paths.allow": "/workspace/src, /output" }),
    },
    expected: {
      layout: WINDOWS_LAYOUT,
      lists: {
        deny: ["/workspace/secrets", "/workspace/secrets/*", "/workspace/keys", "/workspace/keys/*"],
        allow: ["/workspace", "/workspace/*", "/workspace/src", "/workspace/src/*"],
      },
      problems: ["paths.allow (project): '/output' is outside the user's list; a project file may only narrow it"],
      malformed: false,
    },
  },
  {
    name: "lists without a layout, the entries judged on the identity host",
    contents: { [USER_CONFIG_FILE_PATH]: JSON.stringify({ "paths.deny": "/workspace/secrets, C:\\x" }) },
    expected: {
      layout: IDENTITY_HOST, lists: { deny: ["/workspace/secrets", "/workspace/secrets/*"], allow: [] },
      problems: ["paths.deny (user): 'C:\\x' is under no mount of this host: no rule"], malformed: false,
    },
  },
  {
    name: "a value that is not a string is no list",
    contents: { [USER_CONFIG_FILE_PATH]: JSON.stringify({ "paths.deny": ["/workspace/secrets"] }) },
    expected: { layout: IDENTITY_HOST, lists: { deny: [], allow: [] }, problems: [], malformed: false },
  },
  {
    name: "a malformed launch.json is named first, the lists still read",
    contents: { [HOST_LAYOUT_FILE_PATH]: "{", [USER_CONFIG_FILE_PATH]: JSON.stringify({ "paths.deny": "secrets" }) },
    expected: {
      layout: IDENTITY_HOST, lists: { deny: ["/workspace/secrets", "/workspace/secrets/*"], allow: [] },
      problems: [`${HOST_LAYOUT_FILE_PATH} is not JSON: no host layout applies`], malformed: true,
    },
  },
];
