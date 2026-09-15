---
name: gardnr-design
description: Gardnr's design system — tokens, type ramp, UI primitives, and the specific patterns that have been rejected before. Load this BEFORE writing or changing any UI in this repo (JSX styles, CSS, a new component, a new screen, a card, a banner, a badge, an icon, a chart). Also load it when asked to "polish", "clean up", "make it look better", or when a change adds any color, font size, spacing, border, or icon.
---

# Gardnr design system — loader

**The design system is [`docs/design-system.md`](../../../docs/design-system.md).
Read that file, in full, before writing or changing any UI in this repo.**

It lives in `docs/` and not in this file for two reasons. It is the document that
governs how the product looks, so it belongs on a path a person would think to
open, next to the repo's other design docs. And it must have exactly one copy:
this system spent months carrying a rejected-patterns entry that prescribed the
tinted pill-with-a-dot which the same file banned nine rules later, because the
two lived in different places and only one was maintained.

So this file deliberately restates **none** of it. There is nothing to read here
and nothing here to fall out of date. Go read the doc.
