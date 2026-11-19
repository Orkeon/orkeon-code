// The values the learner's prompt shows and its answer check reads: where an owner that is not a file of the checkout
// may live. Orkeon Code's own files are listed one by one (in shared/domain/dev/markers.ts, which --accept reads
// too), a harness owner is a rule of a repository pack.
import { HARNESS_REPO_PACKS } from "../../../shared/domain/dev/learn-proposals.ts";

/** The files of Orkeon Code a motif may name: shared with `--accept`, so defined beside the dev formats. */
export { ORKEON_CODE_DESTINATIONS } from "../../../shared/domain/dev/markers.ts";

/** Where a harness owner may live, in the orkeon-workshop repository: a rule of a repository pack. */
export const HARNESS_DESTINATIONS: readonly string[] = [`${HARNESS_REPO_PACKS}<name>/claude/rules/<file>`];
