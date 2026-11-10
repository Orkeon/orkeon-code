// The text /transcribe hands the model (ADR 0026): the label of the transcription a --then turn reads first.

export const transcriptionPreludeLabel = (path: string) =>
  `Transcription of ${path}, made by /transcribe before this request`;
