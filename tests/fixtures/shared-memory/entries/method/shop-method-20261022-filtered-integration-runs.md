---
id: shop-method-20261022-filtered-integration-runs
type: method
title: Run the integration suite filtered to the touched area, the whole suite once at the end
project: shop
date: 2026-10-22
topic: integration-test-runs
applies_when: the whole integration suite takes too long to run after every change
rationale: the forty-minute suite was skipped altogether, and regressions reached the release branch
source: verdict:workbench/ci/CI-VERIFY-F2.md
status: admitted
supersedes: []
tags: [testing, integration]
stack: [typescript]
---
## Context
The integration suite grew to forty minutes and developers stopped running it locally.

## Content
After each change, run the integration tests filtered by the tag or folder of the touched area (a filtered
integration run). Run the whole suite once, before the pull request, and in CI.

## Evidence
`package.json:14`, `tests/integration/README.md:3`
