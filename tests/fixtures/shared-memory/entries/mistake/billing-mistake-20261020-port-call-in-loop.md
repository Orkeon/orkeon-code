---
id: billing-mistake-20261020-port-call-in-loop
type: mistake
title: A repository call inside a loop over the request items
project: billing
date: 2026-10-20
topic: port-call-in-loop
applies_when: a use case iterates over a collection and needs data per item
rationale: three batches had an N+1 flagged on the Cost axis
correction: fetch once by the set of keys before the loop, then look up in memory
detection_signal: audit row on axis Cost naming a port call inside for/foreach; access-cost report > 1 call per item
source: audit:workbench/orders/ORDERS-VERIFY-F2.md, workbench/orders/ORDERS-VERIFY-F4.md, workbench/refunds/REFUNDS-VERIFY-F1.md
status: admitted
supersedes: []
tags: [cost, data-access]
stack: [csharp]
---
## Context
Order and refund use cases loaded each line's product with one repository call per item: an N+1.

## Content
The mistake: a repository or port call inside a loop over the request items. The fix: collect the keys, fetch them
once before the loop, then look each item up in a dictionary.

## Evidence
`src/Orders/Application/PlaceOrder.cs:57`, `src/Refunds/Application/RefundOrder.cs:33`
