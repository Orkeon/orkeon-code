// What a command's use case returns for its entry point to show. A use case never
// touches the command context: it takes its ports and returns a view, so it runs
// in a test over the fakes of tests/support/; the *.cmd.ts renders the view with
// showView. Lives under commands/_lib/ — the loader's SearchPattern is "*.cmd.ts",
// so this file is never loaded as a command.

/** Optional lines and table, then the closing message. */
export interface CommandView {
  /** Lines written with ctx.writeLine, first (a command's own output: a diff). */
  lines?: string[];
  /** A unified diff, shown as a typed block after the lines: the console colours it, any other shows it plain. */
  diff?: string;
  /** Rows shown with ctx.table, before the message. */
  table?: object[];
  /** The closing message; absent when the table says it all. */
  text?: string;
}

/** The part of the command context a view is shown with. */
export interface ViewContext<R> {
  writeLine(text: string): void;
  writeBlock(spec: { kind: "diff"; text: string }): void;
  table(rows: readonly object[]): void;
  continue(message?: string): R;
}

/** Write the lines and the diff, show the table, if any, then close with the message. */
export function showView<R>(ctx: ViewContext<R>, view: CommandView): R {
  for (const line of view.lines ?? []) ctx.writeLine(line);
  if (view.diff !== undefined) ctx.writeBlock({ kind: "diff", text: view.diff });
  if (view.table) ctx.table(view.table);
  return view.text === undefined ? ctx.continue() : ctx.continue(view.text);
}
