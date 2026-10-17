<!-- Thanks for contributing! The checklist mirrors what CI enforces. -->

## What & why

<!-- One or two sentences: what changes, and the problem it solves. Fixes #123 -->

## Checklist

- [ ] `npm run check` is green (unit tests, type check, bundle check, provenance gate).
- [ ] Runtime code (`src/`) imports no Node API and reaches the runtime globals only
      through `src/shared/infrastructure/globals.ts`.
- [ ] Domain changes come with `*.test.ts` next to the module (`node:test`, `node:assert`,
      hand-written doubles only).
- [ ] A new or renamed command: `docs/commands.md` regenerated (`npm run docs:commands`).
- [ ] Prompts, documentation and comments are original work: nothing copied or closely
      paraphrased from another product (see CONTRIBUTING, "Original work only").
- [ ] `CHANGELOG.md` entry under `[Unreleased]` for anything user-visible.
- [ ] `README.md` and `README.fr.md` stay in step.
- [ ] New shell or shebang scripts committed with the executable bit
      (`git update-index --chmod=+x <script>`).
- [ ] No credential, token or key in the diff.

## Notes for the reviewer

<!-- Trade-offs, follow-ups left out, areas that need a careful look. -->
