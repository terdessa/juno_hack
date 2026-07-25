# Product

## Register

product

## Platform

web

## Users

GPs in UK general practice, working inside a consulting room between
appointments. The screen is glanceable rather than studied: a patient has
just left, the next is due in ninety seconds, and Medley sits alongside the
practice system they actually work in.

Each doctor has their own account and their own list. Patients are shared
when more than one doctor is involved in their care, so a record is never
owned by a single clinician. Work can also be handed to the wider practice
team — nurse, pharmacist, physio, mental health, social prescriber,
reception — which is what makes a task survive someone going on leave.

Multi-doctor accounts are how the real product works. The hackathon build
deliberately runs as one hardcoded doctor with no auth; that shortcut is a
demo decision, not the product.

## Product Purpose

Doctors carry dozens of small follow-ups in their head — call this patient
back, check that dose is working, chase a result. Medley takes the spoken
instruction, works out what needs asking, phones the patient, and brings
back structured answers.

Success is two things the doctor feels rather than measures: time returned,
and nothing forgotten. The second matters most. Left to memory and scraps
of paper, the patients who get chased are the ones who chase hardest.
Medley keeps track of everyone, so attention is distributed evenly rather
than by who shouts.

## Positioning

Every patient gets followed up, not just the ones the doctor happens to
remember.

## Brand Personality

Warm, human, reassuring. This is patient care, and the interface should
read as a good colleague rather than a database — but a colleague who is
also fast and competent, never chatty or soft.

The tension worth naming: the two conventional ways to express warmth are
both rejected below. Warmth here has to be carried by typography, motion,
copy and a committed accent — not by pastels, illustration, or paper-toned
backgrounds.

## Anti-references

All four rejected explicitly:

- **NHS / EMIS legacy software.** Dense grey chrome, tiny type, 2010
  toolbars. Medley must not read as a nicer version of the thing it sits
  beside.
- **Generic SaaS dashboard.** Card grids, hero metrics, gradient accents,
  Inter everywhere.
- **Consumer health app.** Pastel wellness, rounded illustration,
  encouraging copy. Too soft for a clinician mid-clinic.
- **Cream / beige editorial.** The warm paper-toned minimalism the build
  currently has — an AI-generated tell to anyone who has seen a few.

## Design Principles

**Glanceable before browsable.** The doctor reads this in seconds between
patients. What matters must be legible from a metre away without hunting.

**Speaking beats filling in.** A sentence said aloud should always be
faster than any form. Where a form survives, it has failed a test.

**Nothing hides.** A follow-up that exists must be visible without
remembering to look for it. Absence of a reminder is the failure mode this
product exists to fix.

**Equal attention by default.** The interface should not reward the loudest
patient. Quiet, overdue, and easily-forgotten cases surface on their own.

**Say what happened, plainly.** Clinical language when clinical, plain
English otherwise. No cheerfulness, no exclamation marks, no reassurance
the software cannot actually give.

## Accessibility & Inclusion

WCAG 2.2 AA as the baseline: 4.5:1 body contrast, 3:1 large text, complete
keyboard navigation, visible focus. No specific named user needs.

Reduced motion must be honoured — the interface animates to show change
(a call landing, a status moving), and every one of those needs a
non-animated equivalent that still communicates the change.
