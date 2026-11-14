// The objects a runtime may hand over for a model's capabilities and for an effort report, and what is read of them.
import type { EffortReport, ReasoningCapabilities } from "../../../../src/shared/domain/agent-policy/reasoning.ts";

export interface CapabilitiesCase { name: string; raw: unknown; expected: ReasoningCapabilities | null }

export const CAPABILITIES_CASES: readonly CapabilitiesCase[] = [
  {
    name: "reads the model, whether the table knows it, the thinking support and the levels",
    raw: { model: "glm-5.3", known: true, thinking: "effortOnly", efforts: ["low", "high", "max"] },
    expected: { model: "glm-5.3", known: true, thinking: "effortOnly", efforts: ["low", "high", "max"] },
  },
  {
    name: "keeps an empty list of levels for a model that takes none",
    raw: { model: "plain-1", known: true, thinking: "none", efforts: [] },
    expected: { model: "plain-1", known: true, thinking: "none", efforts: [] },
  },
  {
    name: "drops a level that is not one of the five",
    raw: { model: "m", known: false, thinking: "toggle", efforts: ["minimal", "low", "none"] },
    expected: { model: "m", known: false, thinking: "toggle", efforts: ["low"] },
  },
  {
    name: "reads a thinking support it does not know as none, and a missing list as empty",
    raw: { model: "m", known: true, thinking: "adaptive" },
    expected: { model: "m", known: true, thinking: "none", efforts: [] },
  },
  { name: "answers nothing for null", raw: null, expected: null },
  { name: "answers nothing for an object that names no model", raw: { known: true, efforts: ["low"] }, expected: null },
  {
    name: "reads a model whose table entry says nothing of known as unknown",
    raw: { model: "m", thinking: "toggle", efforts: ["low"] },
    expected: { model: "m", known: false, thinking: "toggle", efforts: ["low"] },
  },
  { name: "answers nothing for a value that is not an object", raw: "glm-5.3", expected: null },
];

export interface ReportCase { name: string; raw: unknown; expected: EffortReport | null }

export const REPORT_CASES: readonly ReportCase[] = [
  {
    name: "reads a lowered effort",
    raw: { model: "glm-5.3", asked: "medium", sent: "low", notice: "lowered" },
    expected: { model: "glm-5.3", asked: "medium", sent: "low", notice: "lowered" },
  },
  {
    name: "reads a dropped effort, nothing sent",
    raw: { model: "plain-1", asked: "high", sent: null, notice: "dropped" },
    expected: { model: "plain-1", asked: "high", sent: null, notice: "dropped" },
  },
  {
    name: "reads an effort sent as asked, without a notice",
    raw: { model: "m", asked: "high", sent: "high", notice: null },
    expected: { model: "m", asked: "high", sent: "high", notice: null },
  },
  {
    name: "keeps what was sent when it is not one of the five levels",
    raw: { model: "qwen", asked: "low", sent: "off", notice: "lowered" },
    expected: { model: "qwen", asked: "low", sent: "off", notice: "lowered" },
  },
  {
    name: "reads a notice it does not know as none",
    raw: { model: "m", asked: "high", sent: "high", notice: "raised" },
    expected: { model: "m", asked: "high", sent: "high", notice: null },
  },
  {
    name: "reads an effort sent unchecked",
    raw: { model: "my-custom", asked: "high", sent: "high", notice: "unchecked" },
    expected: { model: "my-custom", asked: "high", sent: "high", notice: "unchecked" },
  },
  {
    name: "reads a sent value that is not a string as nothing sent",
    raw: { model: "m", asked: "high", sent: 3, notice: "dropped" },
    expected: { model: "m", asked: "high", sent: null, notice: "dropped" },
  },
  { name: "answers nothing for a report whose model is not a string", raw: { model: 7, asked: "high", sent: "high" }, expected: null },
  { name: "answers nothing for a report that is not an object", raw: "high", expected: null },
  { name: "answers nothing for null, when no effort is asked", raw: null, expected: null },
  { name: "answers nothing when the level asked is not a level", raw: { model: "m", asked: "huge", sent: null }, expected: null },
];
