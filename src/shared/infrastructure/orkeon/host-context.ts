// The host context of this run (shared/application/host-context.ts: the layout of launch.json and the path lists of
// the settings), read once and shared by every act (llm.ts) and every operation of the file, shell and job adapters.
// wiring.ts, the module every entry point loads, binds the reader over the global tools; an adapter or the Llm
// adapter loaded alone, in a test, finds nothing bound and reads the identity: the spellings pass as they are. The
// read runs at the first call, never at load, and a read that fails (the runtime refusing a call from code while
// agents under other roots run) leaves the identity as well.

import { IDENTITY_CONTEXT } from "../../application/host-context.ts";
import type { HostContext, HostSource } from "../../application/host-context.ts";
import { IDENTITY_HOST } from "../../domain/host-layout.ts";
import type { HostLayout } from "../../domain/host-layout.ts";

/** The host's layout, the identity for an adapter given no context. */
export async function layoutOf(host: HostSource | undefined): Promise<HostLayout> {
  return host === undefined ? IDENTITY_HOST : (await host()).layout;
}

let reader: HostSource | undefined;
let memo: Promise<HostContext> | undefined;

/** Binds the reader of this run's context, or none: the next call reads it again. */
export function bindHostContext(read: HostSource | undefined): void {
  reader = read;
  memo = undefined;
}

/** This run's context: the bound reader's, read once; the identity unbound or when the read fails. */
export const orkeonHostContext: HostSource = () => {
  if (memo === undefined) {
    const read = reader;
    memo = read === undefined
      ? Promise.resolve(IDENTITY_CONTEXT)
      : Promise.resolve().then(() => read()).catch(() => IDENTITY_CONTEXT);
  }
  return memo;
};
