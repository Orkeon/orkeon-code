// The host layout the launcher wrote: /user-config/launch.json, beside the user settings, read through the Files
// port and parsed by the domain (host-layout.ts). A file that is absent, empty or unreadable (no mount, an older
// launcher, docker mode's empty layout) is the identity: today's behaviour, a posix host whose paths need no
// spelling back. One that is not JSON is malformed, named for /doctor, and the identity too.
import type { Files } from "./ports.ts";
import { IDENTITY_HOST, parseHostLayout } from "../domain/host-layout.ts";
import type { HostLayout } from "../domain/host-layout.ts";
import { notJsonNoHostLayout } from "./messages.ts";

export const HOST_LAYOUT_FILE_PATH = "/user-config/launch.json";

export interface HostLayoutRead {
  layout: HostLayout;
  /** What the parse left out, each named (host-layout.ts), and the file itself when it is not JSON. */
  problems: string[];
  /** The file holds text that is not JSON: nothing of it applies. */
  malformed: boolean;
}

const IDENTITY_READ: HostLayoutRead = { layout: IDENTITY_HOST, problems: [], malformed: false };

/** The layout of launch.json, the identity when the file is absent, empty, unreadable or malformed. */
export async function readHostLayout(files: Pick<Files, "read">): Promise<HostLayoutRead> {
  let content: string;
  try {
    content = (await files.read(HOST_LAYOUT_FILE_PATH)).trim();
  } catch {
    return IDENTITY_READ;
  }
  if (content.length === 0) return IDENTITY_READ;
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    return { layout: IDENTITY_HOST, problems: [notJsonNoHostLayout(HOST_LAYOUT_FILE_PATH)], malformed: true };
  }
  const { layout, problems } = parseHostLayout(raw);
  return { layout, problems, malformed: false };
}

/** A reader of the layout that reads once: every call of every act needs it, and the launcher writes it once a run. */
export function onceHostLayout(read: () => Promise<HostLayoutRead>): () => Promise<HostLayoutRead> {
  let layout: Promise<HostLayoutRead> | null = null;
  return () => (layout ??= read());
}
