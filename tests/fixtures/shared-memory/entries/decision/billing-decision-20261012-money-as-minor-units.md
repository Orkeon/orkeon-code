---
id: billing-decision-20261012-money-as-minor-units
type: decision
title: Money is stored as integer minor units, never floating point
project: billing
date: 2026-10-12
topic: money-representation
applies_when: a service persists or sums currency amounts
rationale: rounding drift appeared in monthly totals with doubles
source: human:2026-10-12 plan approval BILLING-PLAN.md
status: admitted
supersedes: []
tags: [money, persistence]
stack: [csharp, postgres]
---
## Context
Monthly invoice totals drifted by a few cents once amounts were summed as doubles across thousands of lines.

## Content
Every currency amount is stored and computed as an integer count of minor units (cents for EUR and USD), in a
bigint column, with the currency code beside it. Conversion to a decimal string happens only at the display edge.

## Evidence
`src/Billing/Domain/Money.cs:12`, `db/migrations/0007_amounts_as_minor_units.sql:1`
