// Checks on what runDevLearn writes and prints.
import { ok } from "node:assert";

import type { FakeFiles } from "../../../../tests/support/doubles/fake-files.ts";
import { parseProposalsFile } from "../../../shared/domain/dev/learn-proposals.ts";
import type { AxisProposal, ProposalsFile } from "../../../shared/domain/dev/learn-proposals.ts";
import { OUT } from "./run-dev-learn.fixtures.ts";
import { WORKSPACE } from "../../../shared/domain/vfs.ts";

/** The proposals.json written under OUT, checked to parse. */
export function writtenProposals(files: FakeFiles): ProposalsFile {
  const parsed = parseProposalsFile(files.files.get(`${OUT}/proposals.json`) ?? "");
  ok(parsed.ok, "proposals.json parses");
  return parsed.file;
}

/** The first axis of the proposals.json written, checked to parse. */
export const writtenTestAxis = (files: FakeFiles): AxisProposal => writtenProposals(files).axes[0];

/** Nothing was written under /workspace/.claude/. */
export function assertNoClaudeWrite(files: FakeFiles): void {
  ok(files.writes.every((w) => !w.path.startsWith(`${WORKSPACE}/.claude/`)), files.writes.map((w) => w.path).join(", "));
}
