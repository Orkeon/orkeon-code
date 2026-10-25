// FakeLogger: the Logger port recording every line, in order, as "info: …" or "warn: …".
import type { Logger } from "../../../src/shared/application/ports.ts";

export class FakeLogger implements Logger {
  lines: string[] = [];

  info(message: string): void {
    this.lines.push(`info: ${message}`);
  }

  warn(message: string): void {
    this.lines.push(`warn: ${message}`);
  }
}
