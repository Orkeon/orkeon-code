// The text /say, /transcribe and /voice show the user (ADR 0026): their usage, their refusals and what a completion
// prints. Read by say.ts, transcribe.ts and voice.ts.

export const SAY_USAGE = "usage: /say [<text>] [--voice <voice>]\n       /say --stop";

export const TRANSCRIBE_USAGE =
  'usage: /transcribe <file> [--lang <code>] [--prompt "<words>"] [--then "<instruction>"]\n' +
  "       /transcribe --list";

export const VOICE_USAGE =
  'usage: /voice [--go] [--lang <code>] [--prompt "<words>"] [--max <seconds>] [--silence <seconds>]\n' +
  "       /voice send";

// The refusals of a bad line
export const unknownArgument = (word: string) => `unknown argument ${word}`;
export const VOICE_NEEDS_NAME = "--voice needs a voice name (fr_FR-siwis-medium, en_US-lessac-medium...)";
export const STOP_ALONE = "--stop takes nothing else";
export const NAME_A_FILE = "name a file under /audio (/transcribe --list shows them)";
export const oneFileAtATime = (file: string, word: string) =>
  `one file at a time (${file}, ${word}): quote a name that holds a space`;
export const needsLanguageCode = (option: string) => `${option} needs a language code (fr, en...)`;
export const PROMPT_NEEDS_WORDS = '--prompt needs the words the speech may contain, quoted ("Orkeon, Jint, MCP")';
export const THEN_NEEDS_INSTRUCTION = "--then needs an instruction";
export const LIST_ALONE = "--list takes no file and no option";
export const SEND_ALONE = "send takes no option and no quotes: /voice send sends the last dictation";
export const secondsBetween = (option: string, min: number, max: number) =>
  `${option} takes seconds between ${min} and ${max}`;

/** The line that says what to do when the server's tools are not registered. */
export function missingToolMessage(tool: string): string {
  return (
    `no registered tool '${tool}': the Whisper MCP server is not connected. Start orkeon-code with ` +
    "ORKEON_CODE_AUDIO_DIR set (docs/configuration.md, Speech-to-text); /debug-tool-call list shows what this host registers."
  );
}

// /say
export const STOPPED = "stopped";
export const toolFailed = (tool: string, failure: string) => `✗ ${tool}: ${failure}`;
export const lastAnswerUnreadable = (reason: string) => `cannot read the session's last answer: ${reason}`;
export const NOTHING_TO_READ = "nothing to read: give a text, or ask the assistant first (/say alone reads its last answer)";
export const TEXT_READ_ALOUD = "text read aloud";
export const LAST_ANSWER_READ_ALOUD = "last answer read aloud";

// /transcribe
export const filesUnder = (root: string) => `the files under ${root}`;
export const transcriptionOf = (path: string) => `transcription of ${path}`;

// /voice
export const recordingLine = (silenceSeconds: number, maxSeconds: number, go: boolean) =>
  `🎙 recording: speak, then stay silent ${silenceSeconds} s to stop (${maxSeconds} s at most)` +
  (go ? "; the text goes straight to the assistant" : "");
export const noDictationToSend = (file: string) => `no dictation to send: /voice records one (it is kept in ${file})`;
export const cannotRead = (file: string, reason: string) => `cannot read ${file}: ${reason}`;
export const voiceFailed = (error: string) => `✗ voice failed: ${error}`;
export const NOTHING_HEARD = "nothing was heard: /voice records again";
export const dictationLine = (payload: string) => `🎙 ${payload}`;
export const DICTATION_NEXT = "send it: /voice send · edit it: /assistant <text> · record again: /voice";
