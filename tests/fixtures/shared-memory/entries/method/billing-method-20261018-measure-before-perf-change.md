---
id: billing-method-20261018-measure-before-perf-change
type: method
title: Measure the access cost before and after a perf change, with the same command
project: billing
date: 2026-10-18
topic: perf-change-method
applies_when: a change is justified by performance
rationale: two batches claimed gains that the re-measure did not show
source: verdict:workbench/perf/PERF-VERIFY-F1.md
status: admitted
supersedes: []
tags: [performance]
stack: []
---
## Context
Two performance batches were accepted on a claim that a later measure did not confirm.

## Content
To justify a performance change, run the same measuring command before and after it, on the same data, and record
both figures (database calls, duration) in the batch notes. A change without the two figures is not a perf change.

## Evidence
`workbench/perf/PERF-VERIFY-F1.md:12`
