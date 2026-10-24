---
id: shop-decision-20261014-money-as-decimal
type: decision
title: Money is stored as a fixed-scale decimal with its currency
project: shop
date: 2026-10-14
topic: money-representation
applies_when: a catalogue stores prices that carry fractions of a minor unit
rationale: supplier prices come with four decimals and must be kept until checkout
source: human:2026-10-14 plan approval SHOP-PLAN.md
status: admitted
supersedes: []
tags: [money, persistence]
stack: [typescript, postgres]
---
## Context
Supplier price lists carry four decimals; rounding them to cents at import lost margin on bulk items.

## Content
Prices are stored as numeric(19,4) with the currency code, handled in code by a decimal library, never by the
number type. Rounding to the minor unit happens once, at checkout, with banker's rounding.

## Evidence
`src/catalog/domain/price.ts:8`, `migrations/2026-10-14-price-numeric.sql:3`
