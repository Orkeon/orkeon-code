---
id: orkeon-code-mistake-20261023-secret-path-staged
type: mistake
title: A commit staged every change, including files that hold credentials
project: orkeon-code
date: 2026-10-23
topic: commit-secret-paths
applies_when: a commit is drafted after staging the whole working tree
rationale: a local environment file reached a commit and its keys had to be rotated
correction: list the staged paths, stop on any secret-like path and let the user decide before the message is drafted
detection_signal: a staged path that the secret-like path check flags (env files, key stores, SSH private keys)
source: audit:workbench/commit/COMMIT-VERIFY-F1.md
status: admitted
supersedes: []
tags: [git, security]
stack: [typescript]
---
## Context
The commit step ran a stage-all command, and a local environment file went into the history with the change.

## Content
The commit messages and the staged set must never leak credentials: before drafting, the commit crew checks the
staged paths against the secret-like path list and stops on a match.

## Evidence
`src/crews/git-commit/domain/commit.ts:44`, `src/shared/domain/secret-patterns.ts:15`
