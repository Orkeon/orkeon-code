// The recorder of a turn's tool calls: it rides on the act's onToolResult, beside the callbacks a crew already
// hands createLlm (the shared memory's guard), and gives the turn's [tools] message (shared/domain/tool-trace.ts).
import { formatToolTrace, traceCall, type ToolCallTrace } from "../../domain/tool-trace.ts";
import type { ToolCallbacks } from "./tool-callbacks.ts";

export interface ToolTrace {
  record(tool: string, input: unknown, result: unknown): void;
  /** The message of the calls recorded since the last take, which forgets them; null when there were none. */
  take(): string | null;
}

export function createToolTrace(): ToolTrace {
  let calls: ToolCallTrace[] = [];
  return {
    record(tool, input, result) { calls.push(traceCall(tool, input, result)); },
    take() {
      const message = formatToolTrace(calls);
      calls = [];
      return message;
    },
  };
}

/** The callbacks given, each result recorded first: their verdicts and their context stand unchanged. */
export function tracedCallbacks(inner: Pick<ToolCallbacks, "forAct">, trace: Pick<ToolTrace, "record">): Pick<ToolCallbacks, "forAct"> {
  return {
    forAct(mode, gateEnabled) {
      const callbacks = inner.forAct(mode, gateEnabled);
      return {
        onToolCall: callbacks.onToolCall,
        async onToolResult(call, result) {
          try { trace.record(call.name, call.input, result); } catch { /* the trace is best-effort */ }
          return callbacks.onToolResult(call, result);
        },
      };
    },
  };
}
