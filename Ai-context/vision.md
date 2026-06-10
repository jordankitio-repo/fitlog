# Gardnr — Vision

> **Purpose:** The north star. What Gardnr is, what it is not, who it serves, and why it exists. One page on purpose. Every feature is judged against this doc; when a proposed feature can't be tied back to it, that's the signal to cut the feature, not stretch the vision.
>
> **What does NOT belong here:** how it's built → `architecture.md`. Why specific choices were made → `decisions.md`. Live status → `current-state.md`. Backlog → `features.md`.

---

## The thesis

**A nutrition coach's bottleneck is not programming. It is attention.**

A coach with 10 clients can review everyone by hand. At 50, patterns start slipping. At 100, the coach becomes an operations manager piecing together screenshots, macros, check-ins, and messages from scattered tools — reviewing data instead of coaching.

Gardnr exists to close the gap between **data collection** and **coaching action**.

## What Gardnr is

The nutrition and body-composition layer coaches use alongside whatever workout tool they already have — built to turn client data into coaching decisions, fast.

> *"Coaches don't build physiques. They create conditions for growth."*

The one-line promise: **help a coach run 100 clients with the attention quality of 20.**

## What Gardnr is NOT (and will not become without an explicit, dated decision)

- **Not a workout-programming platform** — nutrition coaching is the core; programming is deferred until that's validated. (`decisions.md`)
- **Not another consumer food tracker** — MyFitnessPal and Cronometer own the eater. Our customer is the **coach**.
- **Not our own nutrition database, barcode system, food-recognition AI, or wearable ecosystem** — those are infrastructure businesses. We integrate (USDA FDC, OpenFoodFacts), we don't rebuild.
- **Not a cheaper self-serve substitute for coaching** — solo self-analytics stay *descriptive*; the prescriptive/accountability layer is coach-only. (`decisions.md`)

## Who it serves

The **coach** is the customer and the payer. The **client** is brought in by the coach, logs daily, sees their own progress, and is always free. Solo users are a secondary, self-serve descriptive-analytics tier — never the coaching product at a discount.

## How we win

Not on better logging, barcodes, or macro math — those are commodity inputs. We win on the **intelligence layer**: surfacing *why* compliance is slipping, *which* client needs attention first, and *what* the coach should review next — so the coach spends their hours coaching, not reviewing.

The tracker is the data source. The intelligence is the product.

## The one rule that protects all of this

Ship one intelligence layer, get coaches using it, then build the next — never all at once. The standing threat to Gardnr is not that it can't be built; it's scope creep dressed up as ambition. When a shiny multi-layer roadmap appears, it's a temptation list, not a plan. See `decisions.md` → Product Strategy for the guardrails that enforce this, including **no fabricated-confidence numbers**.
